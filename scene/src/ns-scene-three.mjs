/** NeuroSurge POV arm scene: Three.js scene adapter (THREE injected) and the DOM HUD.
 *
 * Nothing here imports 'three' or reads a global: createScene({ THREE, canvas }) receives the library, so this
 * module also loads in Node, where its pure helpers are tested. Three APIs used (all stable since r150): Scene,
 * PerspectiveCamera, WebGLRenderer, Group, Mesh, BufferGeometry, BufferAttribute, MeshStandardMaterial,
 * MeshBasicMaterial, Color, AmbientLight, DirectionalLight, Raycaster, Vector3, Object3D.matrix (Matrix4.fromArray)
 * and DoubleSide. No addons (R558: ns-outline also uses the r170 core WebGLRenderTarget, DepthTexture, DataTexture,
 * ShaderMaterial and BatchedMesh; without them the outlines are off). Colour handling assumes r152+ colour management (linear working space, sRGB output),
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
 *  - D16 3D COMPASS ARROWS replace the DOM orbit buttons: two ns-arrows3d rigs (brain; mirror, green). R558 (user
 *    Message 7): every arrow is a V tip at the middle of a side of its target's frame (the motor strip's 16:9
 *    frame, the mirror body's 9:16 frame; ns-arrows3d planFrameArrows), drawn on top of the scene; (Message 19) each
 *    tip is a solid, softly bevelled chevron tilted in depth, its point away from the viewer and its open ends nearer;
 *    pickArrows(x, y) returns the ray hit list for ns-controls resolveArrowHit (a tip is drawn on top, so a hit tip is
 *    never blocked by what lies behind it); setArrowHover highlights with a plain caption; orbitArrowAt /
 *    hoverOrbitArrow keep the round-4 crosshair API. The scene never orbits anything: presses and holds are R5-input's.
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
 *    shaded by the same rule), under one ns-mirror reflection matrix (det < 0). R558: at the start and after a reset it
 *    is the literal reflection of your posed body in a vertical plane just in front of your toes and fingertips
 *    (ns-mirror mirrorReflectionPlacement, set from the posed body, independent of the brain); setMirrorView for the turn,
 *    the push along the ground or a whole ns-mirror state; tinted only where it lies beyond the brain's nearest point
 *    (BEHIND_GLASS) and dimmed behind the motor areas (ns-colors region backing); index-only LOD copies (2.5 mm at full
 *    quality, coarser first on slow renderers), built a few per frame; mirrorPartAt(x, y) names the part under a point.
 *  - P2 STRIP RELIEF: the lit motor areas (and the legacy strip) take the brain's rigid normal and the far-eye view vector
 *    under the perspective squash (patchRigidNormalShaders), as the glass did in round 4.
 *  - Retired with the DOM buttons: orbitIconSvg, the arrow plan (arrowPlanFor, projectArrowAnchors) and the pointer pins /
 *    DOM hold timers. Kept as unused pure exports for the round-3/4 tests until the integrator retires them:
 *    placeOrbitArrows, orbitArrowLayout, orbitArrowHit, arrowGapPx, ARROW_PLACEMENT, armEnvelopeHits; setArmEnvelope is
 *    a recording no-op.
 * R558 (user Message 2: an optogenetic-style glow with one colour / shade per area, the same on all three items, and a
 * fix for the confusing connecting lines):
 *  - AREA COLOURS (ns-colors AREA_COLORS / AREA_LOOK): every motor area has its own colour (one hue family per body
 *    part). regionDisplayStyle gives each area a calm tint of it at rest and, while active, its glow colour as emission
 *    plus a matching fresnel rim (applyRegionStyle). The shared activity ramp no longer colours areas or muscles.
 *  - MUSCLES glow in the colour of the area that drives them (assignMuscleAreas from the glow links: the stronger drive
 *    wins), shaded toward that colour, with a fresnel rim and a soft additive halo shell (MUSCLE_HALO); one call shades
 *    your body, its in-place head copy and the mirror body, so all three match. Muscles lit only by an opposing-action
 *    hint stay faint (AREA_LOOK.hintGain, no halo).
 *  - LINES (GLOW_LINK.mode 'held', R558 Messages 48 and 56): one line per lit area, in the area's colour, held for as
 *    long as the area is lit. It runs from the lit strip part to the muscle group it drives on the mirror body; with
 *    no mirror body shown it runs to your own body instead. The fan of ribbons to both bodies stays gone.
 *  - HUD: the legend bar is the glow strength; chips explain the colour families (HUD_LEGEND_FAMILIES); the info panel's
 *    swatch and meter use the area's colour.
 * Scientific limits (unchanged): every colour, opacity and label is a simulated, unitless DISPLAY of virtual inputs;
 * regions are control regions of a representative map, not cortical borders, and the face layer is a displaced view,
 * not something a person can see from their own eyes.
 */
import { SEGMENTS, HAND_SEGMENTS, skinApply, twistMapsFor } from './ns-rig.mjs';
import { ARM_DEFAULTS } from './ns-arm.mjs';
import {
  brainWorldMatrix, colormapLinear, gazeDirection, MARKER_GEOMETRY, MARKER_OCTAHEDRON, markerSolid, MARKERS,
  ACTIVITY_FIELD, STRIP_SHADE, RAMP_STOPS_LINEAR, regionTintLinear, stripShade, legendGradientCss
} from './ns-brain.mjs';
import * as NsBrain from './ns-brain.mjs';
import * as NsMath from './ns-math.mjs';
import {
  activityColor, activityColorCss, ACTIVITY_GLOW, RAMP_STOPS_LINEAR as SHARED_RAMP, hexToLinear, RAMP_LABEL, KEY_COLORS,
  // R558 (Message 2): one colour per motor area, shared by the area and the muscles it drives on both bodies.
  AREA_LOOK, AREA_FAMILIES, areaRecord, areaRestTint, areaGlowInto, areaFamilySwatchCss, bodyPartArea, glowStrengthLegendStops,
  // R558 (Message 18): the muscle look (per-muscle tones, storey shade, tendon ends, tissue light).
  MUSCLE_LOOK, MUSCLE_TONES, muscleToneKey, muscleToneFallback, assignMuscleTones, muscleBaseInto, muscleGlowGainScale, EYE_LOOK, eyePartOf, muscleTendonScale, muscleFibreScale,
  // R558 (Messages 25 to 29): the comic cel look of the bodies (bands, rim, highlight shapes, ink).
  BODY_CEL,
  // R558 (Message 22): the power-up charge of an activation (one shared start time per area; the same rule in GLSL).
  POWER_UP, powerUpGlsl, glowIntensity
} from './ns-colors.mjs';

import * as NsText from './ns-text.mjs';
// R5-scene: the fluorescent glow variant of the shared ramp (R5-access; feature-detected: glowColor / glowIntensity / GLOW).
import * as NsColors from './ns-colors.mjs';
// R5-scene: the 3D compass arrows (R5-arrows) and the mirror body's placement, transform and orbit (R5-mirror).
import * as NsArrows from './ns-arrows3d.mjs';
import * as NsMirror from './ns-mirror.mjs';
import * as RayBvh from './ns-raybvh.mjs';
import * as NsCollide from './ns-collide.mjs';
import { readAppliedArmPose } from './ns-body-arm-bridge.mjs';
import { SHOULDER_GIRDLE_INFO } from './ns-assets.mjs';
// R558 (Message 20): outlines where limbs and bodies overlap (an ID pass of the body meshes and a screen-space line pass).
import { createOutlinePass, outlineGroupForArmSegment, outlineGroupForBlend, outlineGroupForPart, outlineGroupForShares, OUTLINE_GROUPS } from './ns-outline.mjs';
// R558 BB (Messages 24, 29): the comic ink look of the brain: folds from the atlas geometry, cel bands, ink and hatching
// on the motor areas, inked contours and a crisp highlight on the glass.
import { BRAIN_INK, foldDepth, foldGrid, foldShade, envelopeNormals, reliefDepth, reliefShare, stripCover, patchAreaInkShaders, areaInkUniformValues, glassInkGlsl, glassInkUniformValues, GLASS_INK_HEAD } from './ns-brain-ink.mjs';

import { REGIONAL_LAYER_PROVENANCE, regionalLayerQualification, regionalLayerMetadata } from './ns-regional-layers.mjs';
// R558: the one rule that says which catalogue records are lifted in the Body Worlds stack, and by which share.
import { bodyStackLevel, BODY_STACK_RULE, bodyMuscleLayer, bodyPacketMuscleName, rForearmTwistTable, rForearmTwistMap, BODY_SEGMENTS as BODY_SEGMENT_LIST } from './ns-body.mjs';
// R558 round 3 (the display fill): the largest displacement the stack display may give a vertex of a muscle it does
// not lift (the fill alone), and of a lifted muscle (its gap plus the fill). Anything larger is refused (scene_input).
const STACK_FILL_CAP_MM = Math.max(...Object.values(BODY_STACK_RULE.fill.mm)) + 0.01;
const STACK_LIFT_CAP_MM = Math.max(...Object.values(BODY_STACK_RULE.gapMm)) + STACK_FILL_CAP_MM;
// R558 (Message 32): a muscle CARRIED on lifted muscles (ns-body BODY_STACK_RULE.carry, exact ids) may move as far as what
// it rides on can push it: the largest lift, its own fill and theirs, the carry margin and the source tolerance.
const STACK_CARRY_CAP_MM = STACK_LIFT_CAP_MM + 2 * STACK_FILL_CAP_MM + BODY_STACK_RULE.carryRule.marginMm - BODY_STACK_RULE.carryRule.coverMm;
const STACK_CARRY_IDS = new Set(BODY_STACK_RULE.carry.map(r => r.id));
const stackCapMm = (level, id = null) => (id !== null && STACK_CARRY_IDS.has(id) ? STACK_CARRY_CAP_MM : level === 'outer' || level === 'intermediate' ? STACK_LIFT_CAP_MM : STACK_FILL_CAP_MM);

const fail = (code, message) => { throw new Error(`ns:${code}: ${message}`); };
/** User-visible wording comes ONLY from ns-text (the single source of plain UI text; a static import). R3-fix (review
 * code F4): the unreachable round-3 fallback copies of that wording are gone. */
const NS_TEXT = NsText;
const dirText = o => Object.freeze({ forward: o.forward, back: o.back, left: o.left, right: o.right });

/** Camera contract (DESIGN.md): PerspectiveCamera(70, aspect, 0.02, 500) at the world origin. */
export const CAMERA = Object.freeze({ fovYDeg: 110, near: 0.02, far: 500 });

/** Display materials. Hex colours are sRGB (Three converts them to its linear working space). */
export const MATERIAL = Object.freeze({
  // R558 (user Message 24: "I liked the space black background"): back to the near-black space background (0x05070b).
  // Message 22 had turned it into a cool slate gradient (backgroundGradientSlate below, kept for reference; backgroundGradient null
  // here means clinicalBackground draws nothing and the flat colour is used). Black also gives the glows and highlights
  // their contrast (Message 25: "Contrast and high dynamic range are still visually key").
  background: 0x05070b,
  backgroundGradientSlate: Object.freeze({ centre: 0x465259, edge: 0x1e282f, centreX: 0.5, centreY: 0.42, radius: 0.78, ditherLsb: 1.5, size: 512 }),
  backgroundGradient: null,
  // R558 (Message 18, "visceral and fleshy but never disgusting"): a softer ivory (was 0xe9dfc4, which glared white
  // under the headlight next to the muscles) and the fallback muscle colour = the first natural muscle tone of ns-colors
  // MUSCLE_TONES (was 0x7a2f24, a dark saturated raw-meat red); each muscle normally draws its own tone (muscleBaseOf).
  // R558 (Message 22, clinical): a clean ivory-white like a bone model (0xd9cdb3 -> 0xe6dfd1, OKLCH 0.851 0.037 86 ->
  // 0.905 0.020 85: less yellow), a little smoother (roughness 0.7 -> 0.64).
  bone: 0xe6dfd1, // clean ivory-white
  // R558 (Messages 25, 29: "real specular highlights", crisp highlight shapes on bone): a little smoother (0.64 -> 0.5),
  // so the key light's highlight on bone is a compact lobe the comic patch can cut into a crisp shape (BODY_CEL.spec).
  // R558 (user Message 54, "a bit of shine, a bit of glossiness"): 0.5 -> 0.38, a polished bone model.
  boneRoughness: 0.38,
  muscleBase: MUSCLE_TONES[0].hex, // rose red
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
// R558 (user Message 22, clinical and surgical): bright, even examination light. The flat fill rises (ambient 0.5 ->
// 0.8) and the sky / ground hemisphere is a clean cool white over a light neutral grey floor bounce (sky 0xdfe9ff ->
// 0xeef4fc, ground 0x3a2622 -> 0x868a8e: the old brown-red bounce filled every underside with a murky blood-brown;
// hemi 1.15 -> 1.35), the camera headlight is a little cooler and softer (white -> 0xf4f8ff, key 2.2 -> 1.9) so the
// shading is gentle, and the cool rim stays for the silhouettes (1.1 -> 0.85, 0xbcd4ff -> 0xcfe0ff). Worked out for a
// surface facing the eye: about 1.2 times the light of before (0.68 -> 0.82 x albedo), on its side away from the key
// light 1.6 times (0.32 -> 0.51 x albedo), so shadows are soft, never murky.
// R558 (user Message 25: "Let's not make things bland. Contrast and high dynamic range are still visually key"): the
// even examination fill above flattened the bodies against the black. Less flat fill (ambient 0.8 -> 0.45, hemi 1.35 ->
// 1.0) over a dark NEUTRAL floor bounce (0x868a8e -> 0x2e3034: shadows go deep again, but grey, never the old murky
// blood-brown), a stronger cool-white key (1.9 -> 2.5) and a brighter rim (0.85 -> 1.3) to cut the silhouettes out of
// the black. The muscle tones stay the clinical ones (Message 22).
export const LIGHT = Object.freeze({
  ambient: 0.45, key: 2.5, keyColor: 0xf4f8ff,
  hemi: 1.0, hemiSky: 0xeef4fc, hemiGround: 0x2e3034,
  rim: 1.3, rimColor: 0xcfe0ff
});

/** R558 (user Message 25: "Contrast and high dynamic range are still visually key"; style guide: the power-up glow
 * "rendered high dynamic range: bright cores that bloom on the space-black background, selective"): the HDR picture
 * and its BLOOM (createHdrBloom). Display choices.
 * How: the main scene is drawn into a half-float multisampled target instead of the canvas, with exactly the colour
 * values, blending and anti-aliasing the canvas would get (same programs: three.js r170 writes a render target's own
 * colour space when it is flagged as an XR target, so the target holds the canvas's sRGB-encoded values; nothing is
 * clamped at 1). Everything at or below display white is therefore unchanged pixel for pixel (glass, areas, the
 * outline pass's ink, the HUD is HTML); only light ABOVE white, i.e. the glows and the brightest highlights, is new
 * information. That excess (above `threshold`, soft knee `knee`, a brightness-weighted average so single bright
 * pixels do not flicker) is blurred down a chain of `levels` half-size targets and added back up (a tent filter per
 * step, each coarser level weighted upGain), and the composite draws min(picture, 1) plus strength x the bloom, plus a white-hot core where the brightest
 * channel passes crossFrom (crossK x the excess, toward white): the TONE CURVE is the identity below white, so area
 * colours and the near-black ink stay exactly as they are. A muscle's power-up peaks (the charge front, the flash,
 * the ripple: power-up gain above muscleFrom) are brightened by muscleBoost x the excess, which pushes their cores past
 * white so they bloom (only while HDR is on; held glows are not boosted). Off on a software renderer, without
 * half-float render targets, and at the coarse quality levels (index >= offFromLevel: lite / lod); at the 0.75 and 0.5
 * render scales one fewer blur level.
 * Tuning: a first try (strength 0.85, every blur level added at full weight, muscleBoost 1.5, white-hot from 1.45, and
 * picture + bloom over white mixed toward white) turned a tapped hand's flash into a white blob with a wide halo, and a
 * looked-at motor area's flash into a white disc: the area's colour was lost. Now the bloom is added and clamped per
 * channel (an orange area's core goes yellow-orange, never white), from 1.1 (a held area glow, about 1.13 encoded at
 * its brightest channel, hardly blooms; a flash, up to about 1.6, does), with a moderate halo.
 * Measured costs are in the build report (frame rate before and after).
 * safeMax (12 November): the bloom's first pass reads every picture value clamped to 0..safeMax and drops a value that
 * is not a number. One such pixel used to be spread by the blur chain into a white square about 280 px across (seen at
 * one exact look, where the x-ray glass's rim term took the power of a number a rounding step below zero; that term
 * and the two like it are now kept at or above zero). No real picture value is near safeMax (a flash peaks near 3), so
 * the picture is unchanged. */
export const HDR_BLOOM = Object.freeze({
  threshold: 1.1, knee: 0.3, strength: 0.45, upGain: 0.7, levels: 5, crossFrom: 2.0, crossK: 0.25,
  muscleBoost: 0.6, muscleFrom: 1.15, offFromLevel: 3, msaaSamples: 4, ditherLsb: 0.6, safeMax: 64
});

/** The HDR target, the bloom chain and the composite (THREE injected). Returns { begin(), end(), setSize(w, h),
 * setLevel(levels), state(), dispose() } or a disabled stub. begin(): renderer.render(scene) after it draws into the HDR
 * target (returns false when off: draw to the canvas as before); end(): bloom and composite to the canvas. */
export function createHdrBloom({ THREE, renderer, msaa = true, enabled = true, o = HDR_BLOOM } = {}) {
  const has = n => Boolean(renderer && renderer.extensions && typeof renderer.extensions.has === 'function' && renderer.extensions.has(n));
  const ok = enabled && THREE && renderer && renderer.capabilities && renderer.capabilities.isWebGL2 !== false && typeof THREE.WebGLRenderTarget === 'function' &&
    typeof THREE.ShaderMaterial === 'function' && THREE.HalfFloatType !== undefined && (has('EXT_color_buffer_float') || has('EXT_color_buffer_half_float'));
  const st = { supported: Boolean(ok), on: false, levels: 0, size: [0, 0], ms: 0, frames: 0 };
  if (!ok) return { begin: () => false, end: () => {}, setSize: () => {}, setLevel: () => {}, state: () => ({ ...st }), dispose: () => {} };
  const mk = (w, h, samples) => {
    const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
      depthBuffer: samples !== null, stencilBuffer: false, samples: samples || 0 });
    return t;
  };
  const main = mk(1, 1, msaa ? o.msaaSamples : 0);
  // r170 reads isXRRenderTarget only to pick the output colour space / tone mapping of the programs drawing into a target
  // (and the internal format of an 8-bit sRGB target); flagged, the target gets the canvas's sRGB-encoded values from
  // the very same programs (no recompiles), so blending and every colour below white match the canvas exactly.
  main.isXRRenderTarget = true;
  if (THREE.SRGBColorSpace !== undefined) main.texture.colorSpace = THREE.SRGBColorSpace;
  const mips = [];
  for (let i = 0; i < 6; i++) mips.push(mk(1, 1, null));
  const VS = 'varying vec2 vUv;\nvoid main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
  const f = x => (Number.isInteger(x) ? x.toFixed(1) : String(x));
  const pre = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) } }, vertexShader: VS,
    fragmentShader: `precision highp float;\nuniform sampler2D tSrc;\nuniform vec2 uTexel;\nvarying vec2 vUv;
vec3 pick( vec2 uv ) {
	vec3 c = min( max( texture2D( tSrc, uv ).rgb, 0.0 ), ${f(o.safeMax)} );
	float b = max( c.r, max( c.g, c.b ) );
	float s = clamp( b - ${f(o.threshold - o.knee)}, 0.0, ${f(2 * o.knee)} );
	s = s * s / ${f(4 * o.knee + 1e-5)};
	float w = max( s, b - ${f(o.threshold)} ) / max( b, 1e-4 );
	return b <= ${f(o.safeMax)} ? c * w : vec3( 0.0 );
}
void main() {
	vec3 a = pick( vUv + uTexel * vec2( -0.5, -0.5 ) ), b = pick( vUv + uTexel * vec2( 0.5, -0.5 ) ), c = pick( vUv + uTexel * vec2( -0.5, 0.5 ) ), d = pick( vUv + uTexel * vec2( 0.5, 0.5 ) );
	float wa = 1.0 / ( 1.0 + max( a.r, max( a.g, a.b ) ) ), wb = 1.0 / ( 1.0 + max( b.r, max( b.g, b.b ) ) ), wc = 1.0 / ( 1.0 + max( c.r, max( c.g, c.b ) ) ), wd = 1.0 / ( 1.0 + max( d.r, max( d.g, d.b ) ) );
	gl_FragColor = vec4( ( a * wa + b * wb + c * wc + d * wd ) / ( wa + wb + wc + wd ), 1.0 );
}`, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
  const down = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) } }, vertexShader: VS,
    fragmentShader: `precision highp float;\nuniform sampler2D tSrc;\nuniform vec2 uTexel;\nvarying vec2 vUv;
void main() {
	vec3 s = texture2D( tSrc, vUv ).rgb * 4.0;
	s += texture2D( tSrc, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb;
	s += texture2D( tSrc, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
	gl_FragColor = vec4( s / 8.0, 1.0 );
}`, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
  const up = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) }, uGain: { value: 1 } }, vertexShader: VS,
    fragmentShader: `precision highp float;\nuniform sampler2D tSrc;\nuniform vec2 uTexel;\nuniform float uGain;\nvarying vec2 vUv;
void main() {
	vec3 s = texture2D( tSrc, vUv ).rgb * 4.0;
	s += ( texture2D( tSrc, vUv + uTexel * vec2( -1.0, 0.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( 1.0, 0.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( 0.0, -1.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( 0.0, 1.0 ) ).rgb ) * 2.0;
	s += texture2D( tSrc, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
	gl_FragColor = vec4( s / 16.0 * uGain, 1.0 );
}`, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false });
  const comp = new THREE.ShaderMaterial({ uniforms: { tBase: { value: main.texture }, tBloom: { value: null }, uBloom: { value: o.strength }, uSize: { value: new THREE.Vector2(1, 1) } }, vertexShader: VS,
    fragmentShader: `precision highp float;\nuniform sampler2D tBase;\nuniform sampler2D tBloom;\nuniform float uBloom;\nuniform vec2 uSize;\nvarying vec2 vUv;
void main() {
	vec3 c = texture2D( tBase, vUv ).rgb;
	vec3 base = min( max( c, 0.0 ), 1.0 );
	float mx = max( c.r, max( c.g, c.b ) );
	base += ( 1.0 - base ) * clamp( ( mx - ${f(o.crossFrom)} ) * ${f(o.crossK)}, 0.0, 1.0 );
	vec3 b = uBloom > 0.0 ? texture2D( tBloom, vUv ).rgb * uBloom : vec3( 0.0 );
	vec3 col = base + b;
	float n = fract( sin( dot( floor( vUv * uSize ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) - 0.5;
	gl_FragColor = vec4( min( col, 1.0 ) + n * ${f(o.ditherLsb / 255)} * step( 0.0005, b.r + b.g + b.b ), 1.0 );
}`, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const quad = new THREE.Mesh(geo, pre);
  quad.frustumCulled = false; quad.matrixAutoUpdate = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  qScene.matrixWorldAutoUpdate = false;
  const qCam = new THREE.Camera();
  let W = 0, H = 0, levels = o.levels;
  function setSize(w, h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (w === W && h === H) return;
    W = w; H = h; main.setSize(w, h);
    let mw = w, mh = h;
    for (const m of mips) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); m.setSize(mw, mh); }
    comp.uniforms.uSize.value.set(w, h);
    st.size = [w, h];
  }
  function setLevel(n) { levels = Math.max(0, Math.min(mips.length, n | 0)); }
  let active = false;
  function begin() {
    active = levels > 0 && W > 1 && H > 1;
    st.on = active; st.levels = active ? levels : 0;
    if (!active) return false;
    renderer.setRenderTarget(main);
    return true;
  }
  const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };
  function end() {
    if (!active) return;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const auto = renderer.autoClear;
    // renderer.info keeps describing the MAIN pass (its draw calls and triangles; the frame counter counts every pass, as
    // it already did for the outline and face passes).
    const info = renderer.info && renderer.info.render, keepInfo = info ? { calls: info.calls, triangles: info.triangles, points: info.points, lines: info.lines } : null;
    renderer.autoClear = false;
    try {
      pre.uniforms.tSrc.value = main.texture; pre.uniforms.uTexel.value.set(1 / W, 1 / H);
      renderer.autoClear = true; pass(pre, mips[0]);
      for (let i = 1; i < levels; i++) {
        down.uniforms.tSrc.value = mips[i - 1].texture; down.uniforms.uTexel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height);
        pass(down, mips[i]);
      }
      renderer.autoClear = false;
      for (let i = levels - 1; i >= 1; i--) {
        up.uniforms.tSrc.value = mips[i].texture; up.uniforms.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height); up.uniforms.uGain.value = o.upGain;
        pass(up, mips[i - 1]);
      }
      comp.uniforms.tBloom.value = mips[0].texture;
      renderer.autoClear = true;
      pass(comp, null);
    } finally {
      renderer.autoClear = auto;
      renderer.setRenderTarget(null);
      if (keepInfo && renderer.info && renderer.info.render) Object.assign(renderer.info.render, keepInfo);
    }
    st.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0; st.frames++;
  }
  function dispose() { main.dispose(); for (const m of mips) m.dispose(); pre.dispose(); down.dispose(); up.dispose(); comp.dispose(); geo.dispose(); }
  return { begin, end, setSize, setLevel, state: () => ({ ...st, cpuMs: Math.round(st.ms * 100) / 100 }), dispose };
}

/** R558 (Message 22): the clinical background (MATERIAL.backgroundGradient) as a screen-filling texture: a radial
 * gradient from `centre` to `edge` drawn once into a small canvas (size x size, stretched to the window like any scene
 * background texture, so it is an ellipse on a wide window), with +-ditherLsb of noise per texel so the slow ramp does
 * not band. One texture, drawn by Three's own background pass: no per-frame work. null without a canvas (then the flat
 * MATERIAL.background is used). */
export function clinicalBackground(THREE, doc, g = MATERIAL.backgroundGradient) {
  if (!THREE || typeof THREE.CanvasTexture !== 'function' || !doc || typeof doc.createElement !== 'function' || !g) return null;
  try {
    const n = g.size, cv = doc.createElement('canvas');
    cv.width = n; cv.height = n;
    const ctx = cv.getContext('2d');
    if (!ctx || typeof ctx.createImageData !== 'function') return null;
    const img = ctx.createImageData(n, n), d = img.data;
    const c0 = [(g.centre >> 16) & 255, (g.centre >> 8) & 255, g.centre & 255], c1 = [(g.edge >> 16) & 255, (g.edge >> 8) & 255, g.edge & 255];
    let seed = 0x9e3779b9;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) - 0.5; };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = (x + 0.5) / n - g.centreX, dy = (y + 0.5) / n - g.centreY;
        const t = Math.min(1, Math.hypot(dx, dy) / g.radius), s = t * t * (3 - 2 * t);
        const o = 4 * (y * n + x), r = 2 * g.ditherLsb * rnd();
        for (let k = 0; k < 3; k++) d[o + k] = Math.max(0, Math.min(255, Math.round(c0[k] + (c1[k] - c0[k]) * s + r)));
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    if (THREE.LinearFilter !== undefined) { tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; }
    tex.name = 'ns-clinical-background (display only)';
    return tex;
  } catch { return null; }
}

/** Glass alpha for a fragment whose interpolated normal makes |N.V| = facing with the view direction (GLSL mirror). */
export function glassAlpha(facing, body, rim, power) {
  const f = facing < 0 ? 0 : facing > 1 ? 1 : facing;
  return body + (rim - body) * Math.pow(1 - f, power);
}

/** R4-scene: the HELD-brain cue. While Space-drag holds the brain, the nearest glass shell's fresnel rim is stronger and
 * wider (a soft glow along the brain's outline and gyri in the glass's own pale colour: not cyan, gold or the activity
 * ramp, so it never reads as activity or the left arm). It eases in (inS) and out (outS) and ends on release; under
 * prefers-reduced-motion it switches without easing. Display only. */
// R558 (issue hunt 2, Message 18: transparency must look clean, not "shard-like"): the held cue was a strong, wide rim
// (opacity 0.9, power 2.4) that lit every grazing gyral wall inside the glass as jagged white glints. Now it is a
// thinner (power 3.6), fainter (opacity 0.55) rim on the CROWNS only (rimGroove 1: no rim at all down in the sulci, where
// the shards sat), so it follows the brain's outer outline.
export const HELD_CUE = Object.freeze({ rimOpacity: 0.55, rimPower: 3.6, rimGroove: 1, inS: 0.1, outS: 0.12 });
/** Shell rim uniforms for a held-cue amount 0..1 (pure): linear from the resting MATERIAL rim (and GLASS_READ's groove
 * share) to HELD_CUE. */
export function heldCueRim(amount, o = HELD_CUE) {
  const a = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
  const g0 = GLASS_READ.rimGroove, g1 = Number.isFinite(o.rimGroove) ? o.rimGroove : g0;
  return { rimOpacity: MATERIAL.glassRimOpacity + (o.rimOpacity - MATERIAL.glassRimOpacity) * a, rimPower: MATERIAL.glassRimPower + (o.rimPower - MATERIAL.glassRimPower) * a,
    rimGroove: g0 + (g1 - g0) * a };
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
/** R558 (Message 7): the V tips are drawn last of the transparent list and without a depth test, i.e. on top of the
 * scene (see makeArrowRig). Both sets share one order, so where a brain tip and a mirror tip overlap Three's
 * back-to-front sort draws the nearer one on top, which is also the one a pick returns first. */
export const ARROW_RENDER_ORDER = Object.freeze({ brain: 100, mirror: 100 });
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
 *    and each time a level is left for being slow again, its block lasts one rememberMs longer (30 s, 60 s, 90 s ...).
 *  - R558 (performance; the picture went soft in a carry and the game was no faster): a cheaper picture is kept only
 *    when the picture is what takes the time.
 *    (a) Main thread: `busyMs` is the game's own work in a frame (frame start to the end of its render). When it fills
 *        busyShare of the slow frames' time, the frames are slow in the game's code and not in the drawing, and no
 *        level is left (lastHold says so). Without busyMs this rule is off.
 *    (b) Probe: after a down-step the next probeFrames samples (or probeMs of them, at least probeMinFrames) are
 *        compared with the slow frames that caused the step. Not gainMin faster -> the next level of another KIND is
 *        tried (render scale -> without the x-ray pass -> simpler meshes; a mesh swap still needs lodDownMeanMs), and
 *        when no kind is left the level the run began at comes back ('no-gain') and is not left for being slow again
 *        for noGainHoldMs (x 2, 3 ... each time it happens again, at most noGainHoldMaxMs). A step that does help
 *        clears that count. */
export const QUALITY_AUTO = Object.freeze({
  slowMs: 1000 / 40, fastMs: 1000 / 55, jumpMs: 1000 / 12, window: 7, gapMs: 1000,
  downHoldMs: 700, downMinFrames: 4, upHoldMs: 6000, upMinFrames: 90, rememberMs: 30000, settleFrames: 2,
  lodDownMeanMs: 1000 / 36,
  busyShare: 0.6, probeFrames: 30, probeMs: 1000, probeMinFrames: 4, gainMin: 0.1, noGainHoldMs: 20000, noGainHoldMaxMs: 300000
});

/** A fresh controller state for `mode` (QUALITY_MODES). `level` is the QUALITY_LEVELS index. */
export function qualityStart(mode = 'auto', levels = QUALITY_LEVELS) {
  const m = QUALITY_MODES.includes(mode) ? mode : 'auto';
  return { mode: m, level: m === 'low' ? levels.length - 1 : 0, samples: [], slowFor: 0, slowN: 0, slowBusy: 0, slowBusyFor: 0, fastFor: 0, fastN: 0, settle: 0, clockMs: 0, blockedUntil: {}, slowLeft: {}, changes: 0, lastChange: null, probe: null, noGain: {}, noGainN: {}, lastHold: null };
}

const medianOf = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };

/** Pure controller step: state (qualityStart) + one frame interval (ms) -> the next state (a new object). 'high' and
 * 'low' never change level. See QUALITY_AUTO for the rules. `busyMs` (optional) is the main-thread work of that frame.
 * `lastChange` records { from, to, medianMs, atMs, why: 'slow' | 'fast' | 'no-gain' }; `lastHold` records a down-step
 * that was not taken { level, atMs, why: 'main-thread' | 'no-gain', busyShare }. */
export function stepQuality(state, frameMs, opts = QUALITY_AUTO, levels = QUALITY_LEVELS, busyMs = NaN) {
  const o = { ...QUALITY_AUTO, ...opts };
  const s = state && typeof state === 'object' ? state : qualityStart('auto', levels);
  const next = { ...s, samples: s.samples.slice(), blockedUntil: { ...s.blockedUntil }, slowLeft: { ...(s.slowLeft || {}) }, noGain: { ...(s.noGain || {}) }, noGainN: { ...(s.noGainN || {}) } };
  const last = levels.length - 1;
  if (next.mode === 'high') { next.level = 0; return next; }
  if (next.mode === 'low') { next.level = last; return next; }
  if (!(Number.isFinite(frameMs) && frameMs > 0 && frameMs <= o.gapMs)) return next; // a gap is not a frame time
  next.clockMs += frameMs;
  if (next.settle > 0) { next.settle -= 1; return next; }
  next.samples.push(frameMs);
  if (next.samples.length > o.window) next.samples.shift();
  const lodKey = l => (levels[l] && levels[l].lod ? JSON.stringify(levels[l].lod) : '');
  const noSlow = () => { next.slowFor = 0; next.slowN = 0; next.slowBusy = 0; next.slowBusyFor = 0; };
  const leave = (from, to) => {
    for (let l = from; l < to; l++) {
      next.slowLeft[l] = (next.slowLeft[l] || 0) + 1;
      next.blockedUntil[l] = next.clockMs + o.rememberMs * next.slowLeft[l];
    }
  };
  const change = (to, why, ms) => {
    next.lastChange = { from: next.level, to, medianMs: Math.round(ms * 10) / 10, atMs: Math.round(next.clockMs), why };
    next.level = to; next.changes += 1;
    next.samples = []; noSlow(); next.fastFor = 0; next.fastN = 0; next.settle = o.settleFrames;
  };
  if (next.probe) {
    // (b) Did the down-step make the frames faster? Nothing else is decided while this is being measured.
    const p = { ...next.probe, sum: next.probe.sum + frameMs, n: next.probe.n + 1 };
    next.probe = p;
    if (!(p.n >= o.probeFrames || (p.sum >= o.probeMs && p.n >= o.probeMinFrames))) return next;
    const afterMs = p.sum / p.n;
    if (afterMs <= p.beforeMs * (1 - o.gainMin)) { next.probe = null; delete next.noGainN[p.anchor]; delete next.noGain[p.anchor]; return next; }
    const kind = l => `${Boolean(levels[l].lite)}|${levels[l].lod ? 1 : 0}`;
    let cand = next.level + 1;
    while (cand <= last && kind(cand) === kind(next.level)) cand += 1;
    if (cand <= last && (lodKey(cand) === lodKey(next.level) || afterMs > o.lodDownMeanMs)) {
      leave(next.level, cand);
      next.probe = { ...p, sum: 0, n: 0 };
      change(cand, 'slow', afterMs);
    } else {
      next.blockedUntil = { ...p.blockedUntil }; next.slowLeft = { ...p.slowLeft };
      const n = (next.noGainN[p.anchor] || 0) + 1;
      next.noGainN[p.anchor] = n;
      next.noGain[p.anchor] = next.clockMs + Math.min(o.noGainHoldMaxMs, o.noGainHoldMs * n);
      next.probe = null;
      change(p.anchor, 'no-gain', afterMs);
    }
    return next;
  }
  if (next.samples.length < Math.min(3, o.window)) return next;
  const med = medianOf(next.samples);
  if (med > o.slowMs) {
    next.slowFor += frameMs; next.slowN += 1; next.fastFor = 0; next.fastN = 0;
    if (Number.isFinite(busyMs) && busyMs >= 0) { next.slowBusy = (next.slowBusy || 0) + Math.min(busyMs, frameMs); next.slowBusyFor = (next.slowBusyFor || 0) + frameMs; }
  }
  else if (med < o.fastMs) { next.fastFor += frameMs; next.fastN += 1; noSlow(); }
  else { noSlow(); next.fastFor = 0; next.fastN = 0; }
  if (next.slowFor >= o.downHoldMs && next.slowN >= o.downMinFrames && next.level < last) {
    const cand = Math.min(last, next.level + (med > 2 * o.jumpMs ? 3 : med > o.jumpMs ? 2 : 1));
    const mean = next.samples.reduce((a, b) => a + b, 0) / next.samples.length;
    // (a) the share of the slow frames' time that was the game's own main-thread work (known for most of them, or unknown)
    const share = next.slowBusyFor >= next.slowFor * 0.5 ? next.slowBusy / next.slowBusyFor : NaN;
    const held = next.noGain[next.level] > next.clockMs;
    if (held || share >= o.busyShare) {
      next.lastHold = { level: next.level, atMs: Math.round(next.clockMs), why: held ? 'no-gain' : 'main-thread', busyShare: Number.isFinite(share) ? Math.round(share * 100) / 100 : null };
      noSlow();
    } else if (lodKey(cand) === lodKey(next.level) || mean > o.lodDownMeanMs) {
      next.probe = { anchor: next.level, beforeMs: next.slowFor / next.slowN, sum: 0, n: 0, blockedUntil: { ...next.blockedUntil }, slowLeft: { ...next.slowLeft } };
      leave(next.level, cand);
      change(cand, 'slow', med);
    }
  } else if (next.fastFor >= o.upHoldMs && next.fastN >= o.upMinFrames && next.level > 0 && !(next.blockedUntil[next.level - 1] > next.clockMs)) {
    change(next.level - 1, 'fast', med);
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
 * R558 (dark flecks on the body at Picture quality Low): the body's coarser copies were vertex clusters of 3D cells
 * alone. On these meshes a 4-7 mm cell often holds vertices of BOTH faces of a thin muscle sheet (or of a fold), and the
 * index-only copies of the lifted / filled / skinned muscles also took one original vertex per cluster with its own
 * full-resolution normal. Measured on the 691 k baked body-muscle triangles at the Low cell (7 mm): 20 % of the copy's
 * triangles faced inward (13.7 % of its area; front faces only, so they were holes to the darker deep layers behind) and
 * 42 % had a corner normal more than 70 deg off their face: the dark flecks. clusterLodPlan instead clusters by cell AND
 * by the vertex normal's main direction (six buckets, so the two faces of a sheet never merge), draws each cluster at
 * its members' mean with their mean normal (clusterLodMeans, also for every other float attribute), and turns a
 * triangle that still faces against its corners' normals the right way round (a folded sliver then covers its hole
 * instead of opening it). The copies hold their own buffers; the body re-writes them from the full buffers whenever
 * those change (the lift amount, a per-vertex skin). The normal buckets split clusters, so LOD_BUCKET_CELL_SCALE x the
 * level's cell keeps about the old triangle count (Low: 125 k -> 148 k). Display choice; pure.
 * @returns { map (Int32Array vertex -> cluster), clusters, inv (Float32Array 1 / members), indices (Uint32Array over
 *   clusters), triangles, rewound }
 */
export const LOD_BUCKET_CELL_SCALE = 1.35;
export function clusterLodPlan(positions, normals, indices, cell) {
  const n = positions.length / 3;
  const map = new Int32Array(n), ids = new Map();
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  const c = cell > 0 ? cell : 1, nx = Math.floor((x1 - x0) / c) + 2, ny = Math.floor((y1 - y0) / c) + 2;
  let k = 0;
  for (let i = 0; i < n; i++) {
    let b = 0;
    if (normals) {
      const a = normals[3 * i], e = normals[3 * i + 1], f = normals[3 * i + 2], ax = Math.abs(a), ay = Math.abs(e), az = Math.abs(f);
      b = ax >= ay && ax >= az ? (a >= 0 ? 0 : 1) : ay >= az ? (e >= 0 ? 2 : 3) : (f >= 0 ? 4 : 5);
    }
    const key = (Math.floor((positions[3 * i] - x0) / c) + nx * (Math.floor((positions[3 * i + 1] - y0) / c) + ny * Math.floor((positions[3 * i + 2] - z0) / c))) * 6 + b;
    let q = ids.get(key);
    if (q === undefined) { q = k++; ids.set(key, q); }
    map[i] = q;
  }
  const cnt = new Float32Array(k), P = new Float64Array(3 * k), N = new Float64Array(3 * k);
  for (let i = 0; i < n; i++) {
    const q = map[i];
    cnt[q]++;
    P[3 * q] += positions[3 * i]; P[3 * q + 1] += positions[3 * i + 1]; P[3 * q + 2] += positions[3 * i + 2];
    if (normals) { N[3 * q] += normals[3 * i]; N[3 * q + 1] += normals[3 * i + 1]; N[3 * q + 2] += normals[3 * i + 2]; }
  }
  const inv = new Float32Array(k);
  for (let q = 0; q < k; q++) { inv[q] = 1 / cnt[q]; P[3 * q] *= inv[q]; P[3 * q + 1] *= inv[q]; P[3 * q + 2] *= inv[q]; }
  const tri = new Uint32Array(indices.length);
  let m = 0, rewound = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = map[indices[t]], b = map[indices[t + 1]], d = map[indices[t + 2]];
    if (a === b || b === d || a === d) continue;
    let flip = false;
    if (normals) {
      const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
      const vx = P[3 * d] - P[3 * a], vy = P[3 * d + 1] - P[3 * a + 1], vz = P[3 * d + 2] - P[3 * a + 2];
      const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
      flip = gx * (N[3 * a] + N[3 * b] + N[3 * d]) + gy * (N[3 * a + 1] + N[3 * b + 1] + N[3 * d + 1]) + gz * (N[3 * a + 2] + N[3 * b + 2] + N[3 * d + 2]) < 0;
    }
    if (flip) { tri[m++] = b; tri[m++] = a; tri[m++] = d; rewound++; } else { tri[m++] = a; tri[m++] = b; tri[m++] = d; }
  }
  return { map, clusters: k, inv, indices: tri.slice(0, m), triangles: m / 3, rewound };
}
/** Per-cluster means of a per-vertex attribute (itemSize numbers per vertex) of a clusterLodPlan into out
 * (clusters x itemSize); unit: renormalise each mean (normals). Returns out. */
export function clusterLodMeans(plan, src, itemSize, out, unit = false) {
  const map = plan.map, inv = plan.inv, n = map.length;
  out.fill(0);
  for (let i = 0; i < n; i++) { const o = itemSize * map[i], s = itemSize * i; for (let j = 0; j < itemSize; j++) out[o + j] += src[s + j]; }
  for (let q = 0; q < plan.clusters; q++) {
    const o = itemSize * q;
    if (unit) {
      let l = 0;
      for (let j = 0; j < itemSize; j++) l += out[o + j] * out[o + j];
      l = Math.sqrt(l);
      if (l > 1e-12) for (let j = 0; j < itemSize; j++) out[o + j] /= l;
    } else for (let j = 0; j < itemSize; j++) out[o + j] *= inv[q];
  }
  return out;
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
  if (t.restMatrix && t.restMatrix.length === 16) { // the un-turned placement is scaled the same way
    const r = Float64Array.from(t.restMatrix);
    for (let i = 0; i < 15; i++) if (i !== 3 && i !== 7 && i !== 11) r[i] *= k;
    out.restMatrix = r;
  }
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
  'diffuseColor.a = mix( diffuseColor.a, nsRimOpacity, pow( max( 1.0 - nsFacing, 0.0 ), nsRimPower ) );'
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
 * term on gyral CROWNS (view-space light from lightDir, the key light's side since BB2: lit faces get up to crownOpacity more alpha and
 * crownBright more light, which gives each gyrus a rounded, lit relief) and (b) a
 * darker, more see-through GROOVE cue from the per-vertex sulcal depth (sulcalDepth; 0 crown .. 1 deep groove): the
 * groove keeps grooveLight of the light and grooveAlpha of the alpha, and sulcal walls lose most of their rim. So the
 * gyri and sulci read at a glance; nothing about tissue optics is implied. */
// R558 BB2 (style guide: one strong key light): the glass's light comes from the scene's key light (the camera headlight,
// camera-space direction (0.6, 1.5, 1.8), upper right), not from the upper left, so the glass gyri and the motor strip
// are lit from the same side. The groove input nsSulc is first the hull depth below and, once the background job has
// run, the glass fold depth of ns-brain-ink (BRAIN_INK.glassFold, see glassFold in createScene).
export const GLASS_READ = Object.freeze({ crownOpacity: 0.035, crownBright: 0.45, grooveLight: 0.38, grooveAlpha: 0.3, rimGroove: 0.65, lightDir: Object.freeze([0.6, 1.5, 1.8]), sulcLoMm: 1.5, sulcHiMm: 9, directions: 320 });
/** R558 (user Message 18, "transparency effects too"; T): the glass clears next to the motor strip. In the start view the
 * neighbouring gyri's glass (in front of the strip in projection) laid a whitish veil over the motor areas (the left-arm
 * areas read lavender-grey instead of blue). Each glass vertex gets its closeness to the strip (1 on it, smoothly 0 at
 * radiusMm, stripProximity); the shell's alpha is multiplied by 1 - clear x closeness, so the glass stays a glass brain
 * everywhere else and the motor areas are seen through clear glass. Display choice. A geometry without the attribute
 * reads 0 (unchanged glass). */
// R558 BB2: the glass OVER the strip (glassFold's stripCover) clears too, and a cleared glass keeps a tenth of its alpha
// (clear 0.8 -> 0.9), so the strip's folds are not veiled; the contours and inked sulci of the glass fade with it.
export const GLASS_CLEAR = Object.freeze({ radiusMm: 7, clear: 0.9 });
/** Closeness of each vertex to a set of point clouds (pure): 1 at distance 0, smoothstep down to 0 at radiusMm (nearest
 * point; the strip's vertices are about 3 mm apart, well under the radius). Uniform grid of cell radiusMm. */
export function stripProximity(positions, pointLists, radiusMm = GLASS_CLEAR.radiusMm) {
  const n = positions.length / 3, out = new Float32Array(n);
  if (!(radiusMm > 0) || !pointLists || !pointLists.length) return out;
  const cell = radiusMm, grid = new Map(), key = (i, j, k) => (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
  const pts = [];
  for (const P of pointLists) if (P && P.length) for (let i = 0; i + 2 < P.length; i += 3) pts.push(P[i], P[i + 1], P[i + 2]);
  for (let p = 0; p < pts.length; p += 3) {
    const kk = key(Math.floor(pts[p] / cell), Math.floor(pts[p + 1] / cell), Math.floor(pts[p + 2] / cell));
    let l = grid.get(kk); if (!l) { l = []; grid.set(kk, l); } l.push(p);
  }
  const r2 = radiusMm * radiusMm;
  for (let v = 0; v < n; v++) {
    const x = positions[3 * v], y = positions[3 * v + 1], z = positions[3 * v + 2];
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell), ck = Math.floor(z / cell);
    let best = r2;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let k = ck - 1; k <= ck + 1; k++) {
      const l = grid.get(key(i, j, k)); if (!l) continue;
      for (const p of l) { const dx = pts[p] - x, dy = pts[p + 1] - y, dz = pts[p + 2] - z, d2 = dx * dx + dy * dy + dz * dz; if (d2 < best) best = d2; }
    }
    if (best < r2) { const t = 1 - Math.sqrt(best) / radiusMm; out[v] = t * t * (3 - 2 * t); }
  }
  return out;
}
const GLASS_SULC_VERTEX = 'vNsSulc = nsSulc;';
const glassReadGlsl = (rimGroove = GLASS_READ.rimGroove, light = GLASS_READ.lightDir) => [
  'vec3 nsN = normalize( vNsNormal ); vec3 nsV = normalize( vNsView );',
  'if ( dot( nsN, nsV ) < 0.0 ) nsN = -nsN;', // the side facing the viewer (DoubleSide glass)
  'float nsFacing = dot( nsN, nsV );',
  `float nsLam = max( dot( nsN, normalize( vec3( ${glslFloat(light[0])}, ${glslFloat(light[1])}, ${glslFloat(light[2])} ) ) ), 0.0 );`,
  'float nsG = clamp( vNsSulc, 0.0, 1.0 );',
  'float nsA = diffuseColor.a + nsRead.x * nsLam * ( 1.0 - nsG );',
  `nsA = mix( nsA, nsRimOpacity, pow( max( 1.0 - nsFacing, 0.0 ), nsRimPower ) * ( 1.0 - ${rimGroove === null ? 'nsRimGroove' : glslFloat(rimGroove)} * nsG ) );`,
  'diffuseColor.a = nsA * mix( 1.0, nsRead.w, nsG ) * ( 1.0 - nsClear * clamp( vNsNear, 0.0, 1.0 ) );',
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
    vertexShader: 'attribute float nsSulc;\nvarying float vNsSulc;\nattribute float nsNear;\nvarying float vNsNear;\n' + GLASS_VARYINGS + vertexShader.slice(0, ve) + '\n' + GLASS_VERTEX_GLSL + '\n' + GLASS_SULC_VERTEX + '\nvNsNear = nsNear;' + vertexShader.slice(ve),
    // R558 (hunt 2): the groove share of the rim is a uniform (nsRimGroove), so the held cue can leave the sulci out
    // R558 BB (style guide): the glass's own contours inked, a light rim inside them, a crisp key-light highlight
    // (ns-brain-ink glassInkGlsl; uniforms nsGInk, nsGInk2, nsGHi, nsGHi2, nsInkG).
    fragmentShader: 'uniform float nsRimOpacity;\nuniform float nsRimPower;\nuniform float nsRimGroove;\nuniform vec4 nsRead;\nuniform float nsClear;\nvarying float vNsSulc;\nvarying float vNsNear;\n' +
      'uniform vec4 nsGInk;\nuniform vec4 nsGInk2;\nuniform vec4 nsGHi;\nuniform vec4 nsGHi2;\nuniform vec4 nsGCel;\nuniform vec4 nsGCel2;\nuniform vec3 nsInkG;\n' + GLASS_INK_HEAD + GLASS_VARYINGS +
      fragmentShader.slice(0, f) + glassReadGlsl(null) + '\n' + glassInkGlsl(GLASS_READ.lightDir) + '\n' + fragmentShader.slice(f)
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
/** R558 (the user's notes of 2026-11-10: "the individual's head is entirely gone", then "If that's the first person
 * view, then the camera should really be sitting on top of the shoulder and not show the back of the body"):
 * IN THE ORDINARY VIEW YOUR OWN BODY IS DRAWN ONLY IN FRONT OF YOUR FACE.
 * What was wrong. To keep the whole left arm in view, the picture camera of the ordinary view backs away from the eye
 * along the line of sight (about 0.3 m at the start, more for a long reach). From there it looked at the back of your
 * own neck, shoulders and trunk, which filled the lower third of the screen, and at a neck that ended in a stump,
 * because the head is never drawn around the camera. That is neither a first-person view (you cannot see your own back)
 * nor a view from behind (the head was missing).
 * The rule now. In the ordinary view a point of your own body (trunk, neck, legs, right arm; never the left arm you
 * control) is drawn only in front of the upright plane through your eye point that faces the way your body faces (the
 * plane of your face): hidden up to planeHideM in front of it, fully drawn from planeFullM, soft in between. The legs
 * use legsHideM / legsFullM instead (behind the plane), so each thigh is drawn whole from the hip joint rather than as
 * a stump that fades in at mid-thigh (viewed both ways). What is left is what you see of yourself without a mirror:
 * your lap, knees and feet, and a forearm and hand resting in front of you. Your back, shoulders, neck and head are behind that plane, however far the camera has backed away and
 * wherever you look. Fragments below `cutoff` are not drawn at all, so a hidden part never blocks what is behind it.
 * Tried and not kept (viewed in the browser): a plane square to the line of sight, with a ball around the eye. Looking
 * down it showed the lower ribs, spine and pelvis from behind as a cut-off trunk. Drawing the head in place, see-through
 * where it covers the motor areas, put a grey-brown smudge over the mirror body and the leg areas at the crosshair.
 * The view from behind (E) draws the whole body, head and face in place, as before; the change between the two views
 * fades with ns-camera's own first-person share. With the camera at the eye (no backing away) the rule is off and the
 * round-3 near-eye rule stands. pickFrom: a click on your own body counts only where it is drawn at least this much.
 * Display only: the pose, the arm fit, the gaze and the camera are untouched. The eye point is the anatomy's own eye
 * reference in the body frame; it is not a measured eye. */
/** R558 (user note 2026-11-11: "No invisible or transparent body parts", "Transparency effects should not be applied to
 * your body when the glass brain is overlapping or near"): your own body is always drawn solid. With this on, none of
 * the see-through rules is applied to an own-body material: not the arm's window at the crosshair (ARM_GHOST / ARM_SEE),
 * not the torso's look-down translucency (BODY_TRANSLUCENT), not the window over the brain's outline (BODY_OVER_BRAIN)
 * and not the first-person plane rule (FIRST_PERSON_BODY). The materials stay plain opaque materials, drawn in the
 * opaque pass with depth written, so the glass brain is blended over the body where it is in front and is hidden by
 * the body where the body is in front, like any solid thing behind or in front of glass. The camera now sits at the
 * eye (scene/example/eye-view-r558.mjs), so nothing has to be cut away to see past your own back. The retired rules
 * stay in this file as pure functions (their tests and the engineering pages still name them) but are not applied.
 * The mirror body's behind-the-glass colour tint is not a transparency of your body and stays. */
export const OWN_BODY_SOLID = true;
export const FIRST_PERSON_BODY = Object.freeze({ planeHideM: 0.03, planeFullM: 0.15, legsHideM: -0.16, legsFullM: -0.04, cutoff: 0.02, pickFrom: 0.35, minBackM: 0.02 });
/** Fragment patch for FIRST_PERSON_BODY (pure). Uniforms: nsFp = (the eye point in view space, metres; amount 0..1),
 * nsFpN = (the body's forward direction in view space, a unit vector; w unused) and nsFpR = (hide, full: metres in
 * front of the plane of the face, the trunk's or the legs' pair; zw unused). `vViewPosition` must be in scope
 * (MeshStandardMaterial). null when a hook is missing (the body is then drawn whole, as before). */
export function patchFirstPersonShaders(vertexShader, fragmentShader, { cutoff = FIRST_PERSON_BODY.cutoff } = {}) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const hook = GLASS_FRAGMENT_HOOKS.find(h => fragmentShader.includes(h));
  if (!hook || !fragmentShader.includes('vViewPosition')) return null;
  const f = fragmentShader.indexOf(hook);
  const body = `
	if ( nsFp.w > 0.0 ) {
		float nsFk = smoothstep( nsFpR.x, nsFpR.y, dot( - vViewPosition - nsFp.xyz, nsFpN.xyz ) );
		nsFk = mix( 1.0, nsFk, nsFp.w );
		if ( nsFk < ${glslFloat(cutoff)} ) discard;
		diffuseColor.a *= nsFk;
	}
`;
  return { vertexShader, fragmentShader: 'uniform vec4 nsFp;\nuniform vec4 nsFpN;\nuniform vec4 nsFpR;\n' + fragmentShader.slice(0, f) + body + fragmentShader.slice(f) };
}
/** The same rule on the CPU (for picks): how much of a point is drawn, 0..1. aheadM: how far the point is in front of
 * the plane of the face (metres, negative behind it). */
export function firstPersonShare(aheadM, amount, legs = false, o = FIRST_PERSON_BODY) {
  if (!(amount > 0)) return 1;
  const lo = legs ? o.legsHideM : o.planeHideM, hi = legs ? o.legsFullM : o.planeFullM;
  const t = Math.min(1, Math.max(0, (aheadM - lo) / (hi - lo)));
  return 1 + (t * t * (3 - 2 * t) - 1) * Math.min(1, amount);
}
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
/**
 * R558 (genuine note R33: the face, neck and torso muscles and some skull bones look "splotchy" with "lots of gaps").
 * Diagnosis from the mesh files: almost every BodyParts3D OBJ repeats some vertices (about a fifth of all body vertices
 * share a position with another one), the loader ignores the files' own `vn` normals, and normals were then computed
 * per vertex INDEX. Two copies of one point on a smooth surface so got two different normals, and every such seam was
 * lit as a hard crease: a patchwork of facets across a muscle. Welding by position leaves no open edge in any of these
 * meshes, so the seams are an artefact of the files, not anatomy.
 * This function makes vertices that share a position share a normal: the normalised sum of their normals. No vertex is
 * added, moved or removed and no triangle changes (the arm's strict vertex counts are untouched); only the lighting
 * across the seam becomes continuous. A copy whose own normal differs from the shared one by more than about 78 degrees
 * (dot < minDot) keeps its own: two surfaces that merely touch back to back, or a real sharp edge, stay as they were.
 * positions, normals: flat xyz arrays of equal length (normals is changed in place). groups (optional): a cached
 * Int32Array from an earlier call for the same mesh (same vertex order and coincidences). Returns { shared (vertices
 * that had a twin), changed (normals rewritten), groups }. Pure apart from writing `normals`.
 */
export function weldNormalsByPosition(positions, normals, { minDot = 0.2, groups = null } = {}) {
  const n = (positions.length / 3) | 0;
  if (!(n > 0) || normals.length < 3 * n) return { shared: 0, changed: 0, groups: null };
  let g = groups && groups.length === n ? groups : null, count = 0, shared = 0;
  if (!g) {
    // Exact-position grouping with an open-addressing table (no strings): a slot holds the first vertex seen at a
    // position, and a vertex joins a slot only when all three coordinates are equal.
    g = new Int32Array(n);
    let size = 16; while (size < 2 * n) size <<= 1;
    const table = new Int32Array(size).fill(-1), mask = size - 1;
    const f = new Float32Array(3), u = new Uint32Array(f.buffer);
    for (let i = 0; i < n; i++) {
      const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
      f[0] = x; f[1] = y; f[2] = z;
      let h = (Math.imul(u[0], 73856093) ^ Math.imul(u[1], 19349663) ^ Math.imul(u[2], 83492791)) & mask;
      for (;;) {
        const j = table[h];
        if (j < 0) { table[h] = i; g[i] = count++; break; }
        if (positions[3 * j] === x && positions[3 * j + 1] === y && positions[3 * j + 2] === z) { g[i] = g[j]; shared++; break; }
        h = (h + 1) & mask;
      }
    }
    if (shared === 0) return { shared: 0, changed: 0, groups: g };
  } else { for (let i = 0; i < n; i++) if (g[i] >= count) count = g[i] + 1; shared = n - count; if (shared === 0) return { shared: 0, changed: 0, groups: g }; }
  const sum = new Float32Array(3 * count), members = new Int32Array(count);
  for (let i = 0; i < n; i++) { const k = 3 * g[i]; sum[k] += normals[3 * i]; sum[k + 1] += normals[3 * i + 1]; sum[k + 2] += normals[3 * i + 2]; members[g[i]]++; }
  let changed = 0;
  for (let i = 0; i < n; i++) {
    if (members[g[i]] < 2) continue;
    const k = 3 * g[i], l = Math.hypot(sum[k], sum[k + 1], sum[k + 2]);
    if (!(l > 1e-6)) continue;
    const x = sum[k] / l, y = sum[k + 1] / l, z = sum[k + 2] / l;
    if (x * normals[3 * i] + y * normals[3 * i + 1] + z * normals[3 * i + 2] < minDot) continue;
    normals[3 * i] = x; normals[3 * i + 1] = y; normals[3 * i + 2] = z; changed++;
  }
  return { shared, changed, groups: g };
}
/** R558 (user Message 30: "The bone tips probably shouldn't be so spikey"): the DISPLAY copy of a finger or toe phalanx
 * (a documented derivative; the OBJ files and the arrays passed in are never changed).
 * Diagnosis (pictures and the mesh files): the BodyParts3D phalanges of the 99 % reduced set are coarse (distal
 * phalanges 112 to 440 triangles, a shaft of 2 to 6 vertices per slice), with small spurs and folds left by the
 * reduction; bare of soft tissue and inked by the outline, the distal ones read as thin pointed hooks. (The larger
 * cause, the lifted finger and toe tendons diving back to their insertions as hooked slivers, is fixed in ns-body
 * BODY_STACK_RULE.digits.) This copy:
 *  1. Taubin smoothing (lambda, mu: a shrink step and an inflate step, so the shape keeps its size) of `passes`
 *     passes over the mesh welded by position (the files repeat vertices along seams), which irons out the reduction's
 *     spurs and creases without rounding the joint ends away;
 *  2. on a DISTAL phalanx (distal: true), the rounded tuft the reduction cut down to a cone (the measured left thumb:
 *     a 25 mm cone from a 4 mm radius down to a point; a real distal phalanx ends in an ungual tuft about as wide as its
 *     shaft): the end with the smaller mean radius is the free tip; over its last tipLenShare of the length no vertex
 *     lies closer to the bone's axis (the centre line of that end third) than a capsule of radius R would put it: R
 *     at a distance d >= R from the extreme point, sqrt(R^2 - (R - d)^2) closer to it (a round cap), where
 *     R = tipShare x the mean radius of the MIDDLE third (the shaft), at least minTipMm and at most maxTipMm; the push
 *     fades out over the inner fadeShare of that length, so there is no ridge. Vertices are only pushed outward from
 *     the axis, never along it: the bone keeps its length and its joint end is untouched.
 * positions: flat xyz (source mm); indices: triangles. Returns a new Float32Array (null for an unusable mesh). Pure. */
export const BONE_TIP_DISPLAY = Object.freeze({ lambda: 0.5, mu: -0.53, passes: 6, tipShare: 1.1, minTipMm: 1.8, maxTipMm: 4.5, tipLenShare: 0.45, fadeShare: 0.35 });
export function boneTipDisplay(positions, indices, { distal = false } = {}, o = BONE_TIP_DISPLAY) {
  const n = positions && indices ? Math.floor(positions.length / 3) : 0;
  if (n < 8 || indices.length < 12) return null;
  const { groups } = weldNormalsByPosition(positions, new Float32Array(3 * n), { minDot: 2 });
  const g = groups || Int32Array.from({ length: n }, (_, i) => i);
  let m = 0; for (let i = 0; i < n; i++) if (g[i] >= m) m = g[i] + 1;
  const P = new Float64Array(3 * m);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) P[3 * g[i] + k] = positions[3 * i + k];
  // Unique neighbour lists of the welded points (CSR).
  const deg = new Int32Array(m), pairs = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = g[indices[t]], b = g[indices[t + 1]], c = g[indices[t + 2]];
    if (a === undefined || b === undefined || c === undefined) return null;
    pairs.push(a, b, b, c, c, a);
  }
  const seen = new Set(), nb = [];
  for (let e = 0; e < pairs.length; e += 2) {
    const a = pairs[e], b = pairs[e + 1];
    if (a === b) continue;
    const k1 = a * m + b, k2 = b * m + a;
    if (seen.has(k1)) continue;
    seen.add(k1); seen.add(k2); nb.push(a, b); deg[a]++; deg[b]++;
  }
  const start = new Int32Array(m + 1);
  for (let i = 0; i < m; i++) start[i + 1] = start[i] + deg[i];
  const adj = new Int32Array(start[m]), fill = start.slice(0, m);
  for (let e = 0; e < nb.length; e += 2) { adj[fill[nb[e]]++] = nb[e + 1]; adj[fill[nb[e + 1]]++] = nb[e]; }
  const Q = new Float64Array(3 * m);
  const step = f => {
    for (let i = 0; i < m; i++) {
      const s0 = start[i], s1 = start[i + 1];
      if (s1 === s0) { Q[3 * i] = P[3 * i]; Q[3 * i + 1] = P[3 * i + 1]; Q[3 * i + 2] = P[3 * i + 2]; continue; }
      let x = 0, y = 0, z = 0;
      for (let s = s0; s < s1; s++) { const j = adj[s]; x += P[3 * j]; y += P[3 * j + 1]; z += P[3 * j + 2]; }
      const k = 1 / (s1 - s0);
      Q[3 * i] = P[3 * i] + f * (x * k - P[3 * i]); Q[3 * i + 1] = P[3 * i + 1] + f * (y * k - P[3 * i + 1]); Q[3 * i + 2] = P[3 * i + 2] + f * (z * k - P[3 * i + 2]);
    }
    P.set(Q);
  };
  for (let p = 0; p < o.passes; p++) { step(o.lambda); step(o.mu); }
  if (distal) {
    // Principal axis of the welded points (power iteration on the covariance).
    const c = [0, 0, 0];
    for (let i = 0; i < m; i++) for (let k = 0; k < 3; k++) c[k] += P[3 * i + k] / m;
    const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < m; i++) { const d = [P[3 * i] - c[0], P[3 * i + 1] - c[1], P[3 * i + 2] - c[2]]; for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) C[3 * r + s] += d[r] * d[s]; }
    let a = [0.577, 0.577, 0.577];
    for (let it = 0; it < 64; it++) { const b = [0, 1, 2].map(r => C[3 * r] * a[0] + C[3 * r + 1] * a[1] + C[3 * r + 2] * a[2]); const l = Math.hypot(b[0], b[1], b[2]); if (!(l > 1e-12)) break; a = [b[0] / l, b[1] / l, b[2] / l]; }
    const t = new Float64Array(m);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < m; i++) { t[i] = (P[3 * i] - c[0]) * a[0] + (P[3 * i + 1] - c[1]) * a[1] + (P[3 * i + 2] - c[2]) * a[2]; if (t[i] < lo) lo = t[i]; if (t[i] > hi) hi = t[i]; }
    const L = hi - lo;
    if (L > 1e-6) {
      // Mean radius of the points in each third (about that third's own centroid line): the free tip is the thinner end.
      const third = sgn => {
        const ctr = [0, 0, 0]; let cnt = 0;
        const inThird = u => (sgn < 0 ? u <= 1 / 3 : sgn > 0 ? u >= 2 / 3 : u > 1 / 3 && u < 2 / 3);
        for (let i = 0; i < m; i++) { if (inThird((t[i] - lo) / L)) { for (let k = 0; k < 3; k++) ctr[k] += P[3 * i + k] - a[k] * t[i]; cnt++; } }
        if (!cnt) return { r: Infinity, ctr };
        for (let k = 0; k < 3; k++) ctr[k] /= cnt;
        let r = 0;
        for (let i = 0; i < m; i++) { if (inThird((t[i] - lo) / L)) r += Math.hypot(P[3 * i] - a[0] * t[i] - ctr[0], P[3 * i + 1] - a[1] * t[i] - ctr[1], P[3 * i + 2] - a[2] * t[i] - ctr[2]); }
        return { r: r / cnt, ctr };
      };
      const A = third(-1), B = third(1), Mid = third(0), tipLo = A.r <= B.r, end = tipLo ? A : B;
      const R = Math.min(o.maxTipMm, Math.max(o.minTipMm, o.tipShare * (Number.isFinite(Mid.r) ? Mid.r : end.r)));
      const reach = o.tipLenShare * L, fade0 = reach * (1 - o.fadeShare);
      for (let i = 0; i < m; i++) {
        const d = tipLo ? t[i] - lo : hi - t[i];
        if (!(d < reach)) continue;
        const rx = P[3 * i] - a[0] * t[i] - end.ctr[0], ry = P[3 * i + 1] - a[1] * t[i] - end.ctr[1], rz = P[3 * i + 2] - a[2] * t[i] - end.ctr[2];
        const rl = Math.hypot(rx, ry, rz), want = d >= R ? R : Math.sqrt(Math.max(0, R * R - (R - d) * (R - d)));
        if (!(rl > 1e-3) || rl >= want) continue;
        const f = d <= fade0 ? 1 : 1 - (d - fade0) / (reach - fade0), w = f * f * (3 - 2 * f);
        const k = w * (want / rl - 1);
        P[3 * i] += rx * k; P[3 * i + 1] += ry * k; P[3 * i + 2] += rz * k;
      }
    }
  }
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) out[3 * i + k] = P[3 * g[i] + k];
  return out;
}

/** R558 (R33): weldNormalsByPosition on a THREE BufferGeometry's position / normal attributes (after its normals were
 * computed). Returns the same report, or null when the geometry has no such attributes. */
export function weldGeometryNormals(geometry) {
  const p = geometry && geometry.attributes && geometry.attributes.position, nr = geometry && geometry.attributes && geometry.attributes.normal;
  if (!p || !nr || !p.array || !nr.array || p.itemSize !== 3 || nr.itemSize !== 3) return null;
  const r = weldNormalsByPosition(p.array, nr.array);
  if (r.changed > 0) nr.needsUpdate = true;
  return r;
}

/** Area-weighted vertex normals of an indexed triangle list, then one normal per POSITION (weldNormalsByPosition).
 * weldCache (optional): an object the CALLER owns, { groups: null } at first. The coincident-vertex groups found for
 * these positions are stored in it and reused by later calls that pass the same object, so pass one only for copies
 * of the same mesh whose vertices coincide in the same places (the game: one per arm muscle, shared by its rest, lifted
 * and blended copies). Without it the function depends on its arguments alone. (Until R558's second review the groups
 * were remembered inside this module per index array, so two different meshes that shared an index array would have
 * been welded with the first one's groups.) */
export function computeNormals(positions, indices, out, weldCache = null) {
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
  // R558 (R33): one normal per POSITION across the files' duplicated vertices (see weldNormalsByPosition).
  const cache = weldCache && typeof weldCache === 'object' ? weldCache : null;
  const cached = cache && cache.groups && cache.groups.length === n ? cache.groups : null;
  const welded = weldNormalsByPosition(positions, o, { groups: cached });
  if (cache && !cached && welded.groups) cache.groups = welded.groups;
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
  if (weights.tf) { // R558: continuous forearm twist (ns-rig skinWeights twist 'continuous'), the same maps as skinApply
    const { plan, maps } = twistMapsFor(matrices, weights, n), I = plan.slots, W = plan.weights;
    for (let v = 0, k = 0; v < n; v++, k += 3) {
      const x = restNormals[k], y = restNormals[k + 1], z = restNormals[k + 2];
      const a = 12 * I[k], b = 12 * I[k + 1], c = 12 * I[k + 2], wa = W[k], wb = W[k + 1], wc = W[k + 2];
      const ox = wa * (maps[a] * x + maps[a + 3] * y + maps[a + 6] * z) + wb * (maps[b] * x + maps[b + 3] * y + maps[b + 6] * z) + wc * (maps[c] * x + maps[c + 3] * y + maps[c + 6] * z);
      const oy = wa * (maps[a + 1] * x + maps[a + 4] * y + maps[a + 7] * z) + wb * (maps[b + 1] * x + maps[b + 4] * y + maps[b + 7] * z) + wc * (maps[c + 1] * x + maps[c + 4] * y + maps[c + 7] * z);
      const oz = wa * (maps[a + 2] * x + maps[a + 5] * y + maps[a + 8] * z) + wb * (maps[b + 2] * x + maps[b + 5] * y + maps[b + 8] * z) + wc * (maps[c + 2] * x + maps[c + 5] * y + maps[c + 8] * z);
      const l = Math.sqrt(ox * ox + oy * oy + oz * oz); // R558 (per-frame cost): Math.hypot is several times slower
      if (l > 0) { o[k] = ox / l; o[k + 1] = oy / l; o[k + 2] = oz / l; } else { o[k] = x; o[k + 1] = y; o[k + 2] = z; }
    }
    return o;
  }
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
    // R558 (performance): sqrt of the sum of squares instead of Math.hypot (about 5x faster here; the stored Float32
    // normals were identical in a 5,000,000-vector comparison of the two).
    const l = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (l > 0) { o[k] = ox / l; o[k + 1] = oy / l; o[k + 2] = oz / l; } else { o[k] = x; o[k + 1] = y; o[k + 2] = z; }
  }
  return o;
}

/** R558 (performance, P2): ns-rig skinApply(matrices, weights, restPositions, outPos) and skinNormals(matrices, weights,
 * restNormals, outNor) for continuous-twist weights (`tf`, the left game arm's muscles) in ONE pass over the vertices:
 * the same plan and pose maps (twistMapsFor, asked once instead of twice), and for every vertex the same expressions in
 * the same order as the two functions' twist branches (terms with weight exactly 0 left out), so the stored positions
 * and normals are theirs to the last bit, bar the sign of a zero. Any
 * other input (no twist, a length or weight mismatch the two would refuse or treat differently) goes to the two
 * functions themselves, which keeps every refusal exactly as it was. */
export function skinPositionsAndNormals(matrices, weights, restPositions, restNormals, outPos, outNor) {
  const w = weights || {}, len = restPositions && typeof restPositions.length === 'number' ? restPositions.length : -1, n = len / 3;
  const fast = matrices instanceof Map && w.tf && len >= 0 && len % 3 === 0 && restNormals && restNormals.length === len
    && outPos && outPos.length === len && outNor && outNor.length === len && w.i0 && w.i1 && w.w0 && w.w1
    && w.i0.length >= n && w.i1.length >= n && w.w0.length >= n && w.w1.length >= n && w.tf.length >= n;
  if (!fast) { skinApply(matrices, weights, restPositions, outPos); skinNormals(matrices, weights, restNormals, outNor); return; }
  const { plan, maps } = twistMapsFor(matrices, weights, n), I = plan.slots, W = plan.weights, P = restPositions, N = restNormals;
  for (let k = 0, e = 3 * n; k < e; k += 3) {
    const a = 12 * I[k], wa = W[k], wb = W[k + 1], wc = W[k + 2];
    const x = P[k], y = P[k + 1], z = P[k + 2], u = N[k], v = N[k + 1], t = N[k + 2];
    let ox, oy, oz;
    if (wc === 0) {
      /* R558 (performance): 19 in 20 of the arm's vertices use one or two of the three slots (a slot the plan leaves
       * unused has weight exactly 0, and a lone slot has weight exactly 1). Leaving out a term that is 0 times a
       * finite number, or a multiplication by exactly 1, gives the same number -- at most the sign of a zero differs. */
      if (wb === 0 && wa === 1) {
        outPos[k] = maps[a] * x + maps[a + 3] * y + maps[a + 6] * z + maps[a + 9];
        outPos[k + 1] = maps[a + 1] * x + maps[a + 4] * y + maps[a + 7] * z + maps[a + 10];
        outPos[k + 2] = maps[a + 2] * x + maps[a + 5] * y + maps[a + 8] * z + maps[a + 11];
        ox = maps[a] * u + maps[a + 3] * v + maps[a + 6] * t;
        oy = maps[a + 1] * u + maps[a + 4] * v + maps[a + 7] * t;
        oz = maps[a + 2] * u + maps[a + 5] * v + maps[a + 8] * t;
      } else {
        const b = 12 * I[k + 1];
        outPos[k] = wa * (maps[a] * x + maps[a + 3] * y + maps[a + 6] * z + maps[a + 9]) + wb * (maps[b] * x + maps[b + 3] * y + maps[b + 6] * z + maps[b + 9]);
        outPos[k + 1] = wa * (maps[a + 1] * x + maps[a + 4] * y + maps[a + 7] * z + maps[a + 10]) + wb * (maps[b + 1] * x + maps[b + 4] * y + maps[b + 7] * z + maps[b + 10]);
        outPos[k + 2] = wa * (maps[a + 2] * x + maps[a + 5] * y + maps[a + 8] * z + maps[a + 11]) + wb * (maps[b + 2] * x + maps[b + 5] * y + maps[b + 8] * z + maps[b + 11]);
        ox = wa * (maps[a] * u + maps[a + 3] * v + maps[a + 6] * t) + wb * (maps[b] * u + maps[b + 3] * v + maps[b + 6] * t);
        oy = wa * (maps[a + 1] * u + maps[a + 4] * v + maps[a + 7] * t) + wb * (maps[b + 1] * u + maps[b + 4] * v + maps[b + 7] * t);
        oz = wa * (maps[a + 2] * u + maps[a + 5] * v + maps[a + 8] * t) + wb * (maps[b + 2] * u + maps[b + 5] * v + maps[b + 8] * t);
      }
    } else {
      const b = 12 * I[k + 1], c = 12 * I[k + 2];
      outPos[k] = wa * (maps[a] * x + maps[a + 3] * y + maps[a + 6] * z + maps[a + 9]) + wb * (maps[b] * x + maps[b + 3] * y + maps[b + 6] * z + maps[b + 9]) + wc * (maps[c] * x + maps[c + 3] * y + maps[c + 6] * z + maps[c + 9]);
      outPos[k + 1] = wa * (maps[a + 1] * x + maps[a + 4] * y + maps[a + 7] * z + maps[a + 10]) + wb * (maps[b + 1] * x + maps[b + 4] * y + maps[b + 7] * z + maps[b + 10]) + wc * (maps[c + 1] * x + maps[c + 4] * y + maps[c + 7] * z + maps[c + 10]);
      outPos[k + 2] = wa * (maps[a + 2] * x + maps[a + 5] * y + maps[a + 8] * z + maps[a + 11]) + wb * (maps[b + 2] * x + maps[b + 5] * y + maps[b + 8] * z + maps[b + 11]) + wc * (maps[c + 2] * x + maps[c + 5] * y + maps[c + 8] * z + maps[c + 11]);
      ox = wa * (maps[a] * u + maps[a + 3] * v + maps[a + 6] * t) + wb * (maps[b] * u + maps[b + 3] * v + maps[b + 6] * t) + wc * (maps[c] * u + maps[c + 3] * v + maps[c + 6] * t);
      oy = wa * (maps[a + 1] * u + maps[a + 4] * v + maps[a + 7] * t) + wb * (maps[b + 1] * u + maps[b + 4] * v + maps[b + 7] * t) + wc * (maps[c + 1] * u + maps[c + 4] * v + maps[c + 7] * t);
      oz = wa * (maps[a + 2] * u + maps[a + 5] * v + maps[a + 8] * t) + wb * (maps[b + 2] * u + maps[b + 5] * v + maps[b + 8] * t) + wc * (maps[c + 2] * u + maps[c + 5] * v + maps[c + 8] * t);
    }
    const l = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (l > 0) { outNor[k] = ox / l; outNor[k + 1] = oy / l; outNor[k + 2] = oz / l; } else { outNor[k] = u; outNor[k + 1] = v; outNor[k + 2] = t; }
  }
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
  // R558 shoulder skin: the chest frame moves the tissue round the shoulder, so a pose with another chest is another pose.
  const cx = a.get('chest'), cy = b.get('chest');
  if (!cx !== !cy) return false;
  if (cx) {
    if (cx.length !== 16 || cy.length !== 16) return false;
    for (let i = 0; i < 16; i++) if (!(Math.abs(cx[i] - cy[i]) <= tol)) return false;
  }
  return true;
}

/** Legacy cache-threshold export retained for source compatibility.
 * updatePose uses the default exact numeric comparison; this constant does not relax pose application. */
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
  // R558 (R32, "a little fleshy"): a moister surface (roughness 0.48 -> 0.36) and the tissue scatter below.
  // R558 (Message 22, clinical): a clean satin finish again (0.36 -> 0.5), no wet sheen.
  // R558 (user Message 54, "very ugly and matte ... add a bit of shine, a bit of glossiness"): glossy (0.5 -> 0.32), so
  // the key light draws a bright highlight along the gyrus crowns.
  activityOpacityGain: 0.65, maxOpacity: 0.92, hoverEmission: 0.14, quantize: 256, roughness: 0.32, metalness: 0,
  /** R558 (R32): tissue look of the motor areas, LIGHTING ONLY. Living tissue lets light in and scatters it, so it is
   * never black in shade and glows a little warm toward its silhouette. tissueTint x tissueStrength x (tissueFloor +
   * (1 - tissueFloor) x a view-angle term) of the area's own colour is added to its lit colour. The geometry, the
   * folds, the area borders, the activity colours (emission) and the opacity rules are untouched. Display choice. */
  // R558 (Message 22, clinical): a cleaner, weaker scatter (tint [1, 0.62, 0.58] -> [1, 0.84, 0.8], strength 0.42 -> 0.28),
  // so the areas read like a painted teaching model, not like raw tissue.
  // R558 BB (Message 25, deep shadows): weaker again (0.28 -> 0.12), so the cel shadow bands can go dark.
  tissueTint: Object.freeze([1.0, 0.84, 0.8]), tissueStrength: 0.12, tissueFloor: 0.4, tissuePower: 2.2,
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
/** R558 (user, Message 6: "Maybe faintly highlight the opposing area on the brain to reset after brain activation ...
 * Agonist vs antagonist principles"): while a joint is held where an action put it, the area that brings it back gets
 * a faint, steady hint: the opposing action's own sub-band of that area (the same rule the look uses to pick an action,
 * ns-brain regionActionAt), or the whole area when that action has no sub-band of its own (pronation / supination).
 * Additive pale light over the area's own colour, never picked, no animation (calm under reduced motion). `color` is
 * linear RGB; a hint may bring its own colour. Display choices. */
export const REGION_HINT = Object.freeze({ color: Object.freeze([0.62, 0.86, 1.0]), opacity: 0.28, renderOrderOffset: 0.2, minTriangles: 8 });
/** R3-scene outline smoothing (smoothTerritoryOutline options, source mm): Chaikin rounds, lift off the surface, specks
 * shorter than minChainMm dropped. Display choices. */
// The BodyParts3D strip parts are not consistently wound (about 40 % of the left-arm faces have +z winding normals), so
// the lift is straight toward the overhead viewer (source +z, superior), which every default and orbit view looks along
// within about 65 deg.
export const REGION_OUTLINE = Object.freeze({ iterations: 2, liftMm: 0.8, minChainMm: 4, quantum: 1e-3, decimate: 2, liftDir: Object.freeze([0, 0, 1]) });

/** R558 (user Message 18: "We should be able to easily differentiate each brain node ... from each other"; issue hunt 1:
 * the borders between motor areas were sawteeth 20-40 px wide at 1600x900). Measured on FJ1801 / FJ1800 with the body
 * map: 4497 of the 8084 strip triangles have corners in two or more areas (the areas are narrower than the atlas
 * triangles), so whole-triangle areas interleaved into a patchwork that read as "flat triangles" and sawteeth. Now an
 * area is drawn PER FRAGMENT: the strip coordinate s (the same per-vertex coordinate the segmentation assigns by,
 * interpolated across the triangle) is looked up against the segmentation's own owner rule (ns-brain regionOwnerAt over
 * the hemisphere's owner list, sampled into exact runs: ownerRuns / ownerTextureData). Each area draws its own triangles
 * plus the neighbours' triangles that reach into its runs, and keeps only the fragments it owns, so every point of the
 * strip is drawn exactly once and the border is the smooth level line of s. The picker uses the same per-point rule
 * (ns-brain classifyRegionGaze), so what is drawn is still what is picked.
 * Borders are drawn in the same pass, constant in CSS pixels (screen gradient of s times the pixel ratio): a thin dark seam between areas of one body
 * part, a light line between body parts (cyan on the left-arm side), and the hovered / switched-on area outlined from
 * the inside. The opposing-action hint (REGION_HINT) is the hinted sub-band of s, soft-edged, in the same pass.
 * Display choices (colours, widths); the area extents are the body map's. */
export const REGION_BORDER = Object.freeze({
  /** Owner lookup resolution (texels over s 0..1; every run of the body map is wider than 0.02). */
  texels: 2048,
  /** Seam between two areas of the same body part: dark warm crease, half-width per side (CSS px), opacity. */
  // R558 (Message 22, clinical): a neutral graphite seam (was a dark red crease [0.075, 0.022, 0.026], #4d292d).
  // R558 BB (Messages 26, 28, style guide): the finest ink line of the hierarchy: near-black #0b0809 (linear here),
  // 1 CSS px across (0.5 each side) at 0.62 opacity, so neighbouring areas read as their own pieces without a heavy grid.
  seamColor: Object.freeze([0.0033, 0.0024, 0.0027]), seamAlpha: 0.62, seamPx: 0.5,
  /** Line between two body parts (or at a map gap): warm ivory, the left-arm side in the territory cyan. */
  // R558 BB: between body parts an ink line one step bolder than the seams (1.5 CSS px, 0.85), no glow; the left-arm
  // territory keeps its cyan identity line (leftArmAlpha, leftArmGlow).
  territoryColor: Object.freeze([0.0033, 0.0024, 0.0027]), territoryAlpha: 0.85, territoryPx: 0.75, territoryGlow: 0,
  leftArmAlpha: 0.9, leftArmGlow: 0.35,
  /** Hovered / switched-on area: outlined from the inside (hover colour / the gold mark colour), half-width CSS px. */
  hoverPx: 1.8, activatedPx: 1.4, highlightGlow: 0.55,
  /** Antialiasing ramp of every line (CSS px), never under aaMinDevicePx drawing-buffer pixels (at the 0.5 / 0.4 quality
   * scales a 0.6 CSS px ramp is under a third of a buffer pixel and the lines alias into stair steps). */
  aaPx: 0.6, aaMinDevicePx: 0.75,
  /** Hint (REGION_HINT): soft edge of the hinted sub-band (CSS px) and emission strength of the hint colour. */
  hintSoftPx: 7, hintGain: 0.45, hintAlpha: 0.12,
  /** Tissue depth (Message 18, "visceral and fleshy"): the lit colour darkens by up to `cavity` where the strip dives into
   * its sulci (the glass's own sulcal depth rule, sulcalDepth over the whole brain's support planes, cavityLoMm ..
   * cavityHiMm), so the gyrus reads as a rounded, living fold instead of flat painted bands. Lighting only. */
  // R558 (Message 22, clinical): softer (0.4 -> 0.28), so the sulci read as clean folds rather than dark crevices.
  // R558 BB (Messages 24, 25): the fold depth now comes from the atlas's own brain geometry (ns-brain-ink foldDepth) and
  // the floors go deeper (0.28 -> 0.4 here, and ns-brain-ink BRAIN_INK.area.floorDark 0.5 on the lit light: a floor keeps
  // about 30 % of a crown's light), so the crowns stay lit, the floors go dark and the area colours still read on the banks.
  // R558 BB2: the cavity input is now the strip's own relief share (ns-brain-ink reliefShare), which also bands the light
  // and darkens the indirect fill (patchAreaInkShaders); the albedo keeps a lighter share of it (0.4 -> 0.2), so the area
  // colours stay recognisable on the deepest bands.
  cavity: 0.2, cavityLoMm: 1.5, cavityHiMm: 10
});

/** Owner runs of one owner list over the strip coordinate (pure): ownerAt(s) -> owner (any value compared with ===, null
 * in a map gap). Scans [0, 1] at `samples` steps; every change is refined by bisection to `tol`. A run narrower than
 * 1 / samples can be skipped (none in the body map). Returns [{ lo, hi, owner }], first lo 0, last hi 1. */
export function ownerRuns(ownerAt, { samples = 4096, tol = 1e-7 } = {}) {
  if (typeof ownerAt !== 'function') fail('scene_input', 'ownerAt must be a function');
  const runs = [];
  let cur = ownerAt(0), a0 = 0, lo = 0;
  for (let i = 1; i <= samples; i++) {
    const s = i / samples;
    for (let guard = 0; ownerAt(s) !== cur && guard < 16; guard++) {
      let a = a0, b = s;
      while (b - a > tol) { const m = 0.5 * (a + b); if (ownerAt(m) === cur) a = m; else b = m; }
      runs.push({ lo, hi: b, owner: cur });
      lo = b; cur = ownerAt(b); a0 = b;
    }
    a0 = s;
  }
  runs.push({ lo, hi: 1, owner: cur });
  return runs;
}

/** Border kind between two neighbouring runs (pure): 0 none, 1 two areas of one body part, 2 two body parts, 3 an area
 * and a map gap. `groupOf(owner)` gives the body-part group key. */
export function borderKind(a, b, groupOf) {
  if (a === null && b === null) return 0;
  if (a === null || b === null) return 3;
  if (a === b) return 0;
  return groupOf(a) === groupOf(b) ? 1 : 2;
}

/** Owner lookup texture data (pure). rows: [runs] (ownerRuns), idOf(owner) -> float id (-1 for null), groupOf(owner).
 * Two RGBA float texels per (row, texel i) over s in [i / W, (i + 1) / W): texel row 2r = (owner left of B, owner right
 * of B, B, kind at B), row 2r + 1 = (last border at or below the texel, its kind, first border at or above the texel's
 * end, its kind). B is the border inside the texel, or (no border inside) the next border above with its kind, so the
 * shader's rule is: s < B ? (owner x, run [lower, B]) : (owner y, run [B, upper]). Ends of the strip: +-10, kind 0. */
export function ownerTextureData(rows, idOf, groupOf, width = REGION_BORDER.texels) {
  const W = width, data = new Float32Array(W * 2 * rows.length * 4);
  rows.forEach((runs, r) => {
    const bounds = [];
    for (let k = 1; k < runs.length; k++) bounds.push({ s: runs[k].lo, kind: borderKind(runs[k - 1].owner, runs[k].owner, groupOf), left: runs[k - 1].owner, right: runs[k].owner });
    let j = 0; // first border with s > texel start
    for (let i = 0; i < W; i++) {
      const t0 = i / W, t1 = (i + 1) / W;
      while (j < bounds.length && bounds[j].s <= t0) j++;
      const lower = j > 0 ? bounds[j - 1] : null;
      const inside = j < bounds.length && bounds[j].s < t1 ? bounds[j] : null;
      let up = j;
      while (up < bounds.length && bounds[up].s < t1) up++;
      const upper = up < bounds.length ? bounds[up] : null;
      // owner at the texel start
      let ownerStart = runs[0].owner;
      for (const run of runs) if (run.lo <= t0 && t0 < run.hi) { ownerStart = run.owner; break; }
      const o = 4 * ((2 * r) * W + i), o2 = 4 * ((2 * r + 1) * W + i);
      data[o] = idOf(ownerStart);
      if (inside) { data[o + 1] = idOf(inside.right); data[o + 2] = inside.s; data[o + 3] = inside.kind; }
      else { data[o + 1] = idOf(ownerStart); data[o + 2] = upper ? upper.s : 10; data[o + 3] = upper ? upper.kind : 0; }
      data[o2] = lower ? lower.s : -10; data[o2 + 1] = lower ? lower.kind : 0;
      data[o2 + 2] = upper ? upper.s : 10; data[o2 + 3] = upper ? upper.kind : 0;
    }
  });
  return data;
}

/** Smooth vertex normals of one closed atlas surface (pure): coincident vertices are welded (the OBJ parser splits them
 * along seams) and every face adds its area-weighted normal (winding order, as computeVertexNormals) to its corners.
 * Returns Float32Array (xyz per input vertex). The positions are untouched: lighting only. */
export function smoothSurfaceNormals(positions, indices) {
  const n = positions.length / 3, rep = new Int32Array(n), keyOf = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${positions[3 * i]},${positions[3 * i + 1]},${positions[3 * i + 2]}`;
    let r = keyOf.get(k);
    if (r === undefined) { r = keyOf.size; keyOf.set(k, r); }
    rep[i] = r;
  }
  const acc = new Float64Array(3 * keyOf.size);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const ax = positions[3 * a], ay = positions[3 * a + 1], az = positions[3 * a + 2];
    const e1x = positions[3 * b] - ax, e1y = positions[3 * b + 1] - ay, e1z = positions[3 * b + 2] - az;
    const e2x = positions[3 * c] - ax, e2y = positions[3 * c + 1] - ay, e2z = positions[3 * c + 2] - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) { const r = 3 * rep[v]; acc[r] += nx; acc[r + 1] += ny; acc[r + 2] += nz; }
  }
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const r = 3 * rep[i], L = Math.hypot(acc[r], acc[r + 1], acc[r + 2]) || 1;
    out[3 * i] = acc[r] / L; out[3 * i + 1] = acc[r + 1] / L; out[3 * i + 2] = acc[r + 2] / L;
  }
  return out;
}

const BORDER_VERTEX_HOOK = '#include <begin_vertex>';
const BORDER_EARLY_HOOK = '#include <clipping_planes_fragment>';
const BORDER_COLOR_HOOK = '#include <color_fragment>';
const BORDER_EMISSIVE_HOOK = '#include <emissivemap_fragment>';
/** Shader patch (pure) for the per-fragment areas (REGION_BORDER): attributes nsS (strip coordinate) and nsRow (owner
 * texture row, 1 for a neighbour's triangle). Uniforms: nsOwnTex / nsOwnInfo (texels), nsRegionId, nsSeam, nsTerr
 * (rgb, alpha), nsTerrGlow, nsLineW (seam, territory half-widths in CSS px, -, pixel ratio), nsHi (highlight rgb,
 * half-width CSS px; 0 = none), nsHint (lo, hi, strength, alpha), nsHintColor, nsBorderAA (aa px, hint soft px,
 * highlight glow, cavity darkening); attribute nsCav (sulcal depth 0..1, optional). A fragment the area does not own is discarded (its own
 * triangles also keep map-gap fragments). null when a hook is missing (the area is then drawn by whole triangles). */
export function patchRegionBorderShaders(vertexShader, fragmentShader) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  if (!vertexShader.includes(BORDER_VERTEX_HOOK) || !fragmentShader.includes(BORDER_EARLY_HOOK) || !fragmentShader.includes(BORDER_COLOR_HOOK) || !fragmentShader.includes(BORDER_EMISSIVE_HOOK)) return null;
  const early = [
    // s per CSS pixel (before any discard): the screen gradient of s is per drawing-buffer pixel and one CSS pixel is
    // nsLineW.w (the pixel ratio) buffer pixels, so the gradient is MULTIPLIED by it (check: dividing made every line
    // 1 / pr^2 as wide, 4x at the 0.5 quality scale and a quarter at pr 2). Euclidean gradient, so a line is as wide at
    // every angle (fwidth's |dx| + |dy| thinned diagonal lines by up to 1 / sqrt 2).
    '\tfloat nsPr = max( nsLineW.w, 0.25 );',
    '\tfloat nsFw = max( length( vec2( dFdx( vNsS ), dFdy( vNsS ) ) ), 1e-7 ) * nsPr;',
    // antialiasing ramp: the CSS-pixel ramp, never under aaMinDevicePx drawing-buffer pixels (no stair steps at low scales)
    `\tfloat nsAA = max( nsBorderAA.x, ${glslFloat(REGION_BORDER.aaMinDevicePx)} / nsPr );`,
    '\tfloat nsSv = clamp( vNsS, 0.0, 1.0 );',
    '\tint nsRowI = int( vNsRow.x + 0.5 );',
    '\tint nsTi = clamp( int( floor( nsSv * nsOwnInfo.x ) ), 0, int( nsOwnInfo.x ) - 1 );',
    '\tvec4 nsTa = texelFetch( nsOwnTex, ivec2( nsTi, 2 * nsRowI ), 0 );',
    '\tvec4 nsTb = texelFetch( nsOwnTex, ivec2( nsTi, 2 * nsRowI + 1 ), 0 );',
    '\tbool nsLeft = nsSv < nsTa.z;',
    '\tfloat nsOwner = nsLeft ? nsTa.x : nsTa.y;',
    '\tfloat nsLo = nsLeft ? nsTb.x : nsTa.z, nsKLo = nsLeft ? nsTb.y : nsTa.w;',
    '\tfloat nsHiS = nsLeft ? nsTa.z : nsTb.z, nsKHi = nsLeft ? nsTa.w : nsTb.w;',
    '\tbool nsMine = abs( nsOwner - nsRegionId ) < 0.5;',
    '\tif ( ! nsMine && ! ( vNsRow.y < 0.5 && nsOwner < - 0.5 ) ) discard;',
    '\tfloat nsDLo = ( nsSv - nsLo ) / nsFw, nsDHi = ( nsHiS - nsSv ) / nsFw;', // CSS px to each end of the run
    '\tfloat nsSeamCov = 0.0, nsTerrCov = 0.0, nsHiCov = 0.0, nsHintAmt = 0.0;',
    '\tif ( nsMine ) {',
    '\t\tnsSeamCov = max( nsKLo == 1.0 ? nsCov( nsDLo, nsLineW.x, nsAA ) : 0.0, nsKHi == 1.0 ? nsCov( nsDHi, nsLineW.x, nsAA ) : 0.0 );',
    '\t\tnsTerrCov = max( nsKLo >= 2.0 ? nsCov( nsDLo, nsLineW.y, nsAA ) : 0.0, nsKHi >= 2.0 ? nsCov( nsDHi, nsLineW.y, nsAA ) : 0.0 );',
    '\t\tif ( nsHi.a > 0.0 ) nsHiCov = max( nsKLo >= 1.0 ? nsCov( nsDLo, nsHi.a, nsAA ) : 0.0, nsKHi >= 1.0 ? nsCov( nsDHi, nsHi.a, nsAA ) : 0.0 );',
    '\t\tif ( nsHint.z > 0.0 ) { float nsHw = nsBorderAA.y * nsFw; nsHintAmt = nsHint.z * smoothstep( nsHint.x - nsHw, nsHint.x + nsHw, nsSv ) * ( 1.0 - smoothstep( nsHint.y - nsHw, nsHint.y + nsHw, nsSv ) ); }',
    '\t}'
  ].join('\n');
  const color = [
    '\tdiffuseColor.rgb *= 1.0 - nsBorderAA.w * clamp( vNsCav, 0.0, 1.0 );',
    '\tdiffuseColor.rgb = mix( diffuseColor.rgb, nsSeam.rgb, nsSeamCov * nsSeam.a );',
    '\tdiffuseColor.rgb = mix( diffuseColor.rgb, nsTerr.rgb, nsTerrCov * nsTerr.a );',
    '\tdiffuseColor.rgb = mix( diffuseColor.rgb, nsHi.rgb, nsHiCov );',
    '\tdiffuseColor.a = max( max( diffuseColor.a + nsHintAmt * nsHint.w, nsHiCov ), max( nsSeamCov * nsSeam.a, nsTerrCov * nsTerr.a ) );'
  ].join('\n');
  const emissive = [
    '\ttotalEmissiveRadiance *= 1.0 - 0.75 * max( nsSeamCov * nsSeam.a, nsTerrCov * nsTerr.a );',
    '\ttotalEmissiveRadiance += nsTerr.rgb * ( nsTerrCov * nsTerr.a * nsTerrGlow );',
    '\ttotalEmissiveRadiance = mix( totalEmissiveRadiance, nsHi.rgb * nsBorderAA.z, nsHiCov );',
    '\ttotalEmissiveRadiance += nsHintColor * nsHintAmt;'
  ].join('\n');
  const head = 'uniform sampler2D nsOwnTex;\nuniform vec2 nsOwnInfo;\nuniform float nsRegionId;\nuniform vec4 nsSeam;\nuniform vec4 nsTerr;\nuniform float nsTerrGlow;\n' +
    'uniform vec4 nsLineW;\nuniform vec4 nsHi;\nuniform vec4 nsHint;\nuniform vec3 nsHintColor;\nuniform vec4 nsBorderAA;\nvarying float vNsS;\nvarying vec2 vNsRow;\nvarying float vNsCav;\n' +
    'float nsCov( float d, float w, float aa ) { return 1.0 - smoothstep( w - aa, w + aa, d ); }\n';
  return {
    vertexShader: 'attribute float nsS;\nattribute vec2 nsRow;\nattribute float nsCav;\nvarying float vNsS;\nvarying vec2 vNsRow;\nvarying float vNsCav;\n' +
      vertexShader.replace(BORDER_VERTEX_HOOK, `${BORDER_VERTEX_HOOK}\nvNsS = nsS;\nvNsRow = nsRow;\nvNsCav = nsCav;`),
    fragmentShader: head + fragmentShader
      .replace(BORDER_EARLY_HOOK, `${BORDER_EARLY_HOOK}\n${early}`)
      .replace(BORDER_COLOR_HOOK, `${BORDER_COLOR_HOOK}\n${color}`)
      .replace(BORDER_EMISSIVE_HOOK, `${BORDER_EMISSIVE_HOOK}\n${emissive}`)
  };
}

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
// R558 (Message 2): every area now has its own colour and the left-arm areas are the blue family, so the cyan band is
// only a faint edge (mix 0.85 -> 0.3, glow 0.45 -> 0.12): at full strength it read as one more cyan area and hid the
// colours of the border areas (shoulder, thumb).
export const LEFT_ARM_RIM = Object.freeze({ widthMm: 2.5, mix: 0.3, alpha: 0.9, glow: 0.12 });

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
 * albedo, emission (linear), rim (linear fresnel rim colour), opacity, glow, activated }. R558: the tint and the glow
 * come from the area's own colour (ns-colors AREA_COLORS / AREA_LOOK); activatedCount >= 1 moves the tint toward that
 * colour and raises the opacity (activatedOpacity + activatedOpacityPerExtra per extra activation, capped). */
export function regionDisplayStyle(region, { activity = 0, activatedCount = 0, hovered = false } = {}, out = null, style = regionStyleConstants(), render = REGION_RENDER) {
  if (!region) fail('scene_region', 'region is required');
  const o = out || { tint: [0, 0, 0], albedo: [0, 0, 0], emission: [0, 0, 0], rim: [0, 0, 0], opacity: 0, glow: 0, activated: false };
  if (!o.rim) o.rim = [0, 0, 0];
  const n = Number.isFinite(activatedCount) ? activatedCount : 0;
  const activated = n >= 1;
  if (areaRecord(region.id)) {
    // R558 (Message 2, optogenetic look): every area has its OWN colour (ns-colors AREA_COLORS). At rest a calm tint of
    // it over the R32 tissue pink; switched on, a little more of it; active, the area emits its glow colour (strength =
    // ns-colors glowIntensity of the activity) with a matching fresnel rim, and its lit surface darkens so the emitted
    // colour carries the look. The muscles it drives glow in the very same colour (shadeMuscle).
    const a = fin01(activity);
    areaRestTint(region.id, { activated }, o.tint);
    const k = areaGlowInto(region.id, a, AREA_LOOK.areaGain, o.emission);
    areaGlowInto(region.id, a, AREA_LOOK.areaRimGain, o.rim);
    const d = 1 - AREA_LOOK.areaDarken * k;
    for (let i = 0; i < 3; i++) o.albedo[i] = o.tint[i] * d;
    // R558 (Message 22): the faint resting self-light of the area's own tint (AREA_LOOK.restLift), gone once it glows.
    const lift = (Number.isFinite(AREA_LOOK.restLift) ? AREA_LOOK.restLift : 0) * (1 - k);
    for (let i = 0; i < 3; i++) o.emission[i] += o.tint[i] * lift;
    o.glow = k;
  } else {
    // An id outside the area table (not expected): the older shared-ramp rule.
    const base = region.isLeftArm ? style.leftArmTint : (Math.round(Number(region.order) || 0) % 2 === 0 ? style.otherTint : style.otherTintAlt);
    const mix = activated ? style.activatedShadeMix : 0;
    for (let i = 0; i < 3; i++) o.tint[i] = base[i] + (style.activatedShade[i] - base[i]) * mix;
    activityShadeInto(o.tint, activity, o);
    o.rim[0] = o.rim[1] = o.rim[2] = 0;
  }
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

/** Label groups of a segmentation's regions: [{ key, hemisphere, text, isLeftArm, regionIds, anchor (source mm),
 * ownAnchor (source mm, the area-weighted mean of the member regions' byHemisphere anchors), pair, areaMm2 }], left-arm
 * group first. R558 ("brain labels ... match on both sides"): a group and its twin on the other half (arm with arm, leg
 * with leg, belly with belly, face with face) share `pair` and are anchored at mirrored places: `anchor` is the mean of
 * the group's own anchor and the twin's anchor mirrored in the plane source x = midX. The scene passes the middle of
 * the motor strip's own left-right extent, which is what the start view centres on screen: the two halves of a real
 * brain are not exact mirror images, and with source x = 0 every pair sat about 9 px left of the middle at 1600 px.
 * A display choice for where a label sits; no area is moved. A group without a twin keeps anchor = ownAnchor and
 * pair = null. */
export function regionLabelGroups(regions, { midX = 0 } = {}) {
  const mx = Number.isFinite(midX) ? midX : 0;
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
  const list = [...groups.values()].map(g => ({
    key: g.key, hemisphere: g.hemisphere, text: g.text, isLeftArm: g.isLeftArm, regionIds: g.regionIds,
    anchor: g.sum.map(x => x / g.areaMm2), ownAnchor: null, pair: null, areaMm2: g.areaMm2
  })).sort((a, b) => (b.isLeftArm - a.isLeftArm) || (a.hemisphere < b.hemisphere ? 1 : a.hemisphere > b.hemisphere ? -1 : 0));
  const pairKey = g => (g.key === 'leftArm' ? 'arm' : g.key);
  for (const g of list) g.ownAnchor = g.anchor;
  for (const a of list) {
    if (a.hemisphere !== 'right') continue;
    const b = list.find(q => q.hemisphere === 'left' && pairKey(q) === pairKey(a));
    if (!b) continue;
    const m = [(a.ownAnchor[0] - b.ownAnchor[0]) / 2, (a.ownAnchor[1] + b.ownAnchor[1]) / 2, (a.ownAnchor[2] + b.ownAnchor[2]) / 2];
    a.anchor = [mx + m[0], m[1], m[2]];
    b.anchor = [mx - m[0], m[1], m[2]];
    a.pair = b.pair = pairKey(a);
  }
  return list;
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
   * words, ns-text ARROWS.brain ("Turn the brain: show more of its front" ...; no "curved"), else the round-4 ORBIT words. */
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
 * R558 (motor strip fills the view): with topCentreFirst the order is top centre, bottom centre, top right, bottom
 * left: at the start the motor areas leave the top centre free (the notch between the two halves), so the line has one
 * steady place under the limits line; the bottom-right corner is the information card's and is not tried.
 * R558 (Message 7): the brain's forward arrow now sits at the top centre (the middle of the motor strip's frame's top
 * side). `beside` (its box, CSS px) puts the line just beside it first, right of it, then left of it, level with it,
 * so the two never collide and the line keeps its place near the top centre. `beside` may also be a list of boxes,
 * tried in order (the top arrow first, then the bottom arrows), and `under` (a box or a list) adds, after those, the
 * place centred just below each, above the bottom reserve: in a squarer window (4:3) the motor strip leaves no room
 * beside the top arrow, while the view below the strip is free.
 * R558 (issue hunt 2: looking down, the chip wandered to the middle of the view over your legs): topBandPx (CSS px)
 * keeps every candidate inside the top band of the usable view (its bottom edge at most topBandPx below the usable
 * top); with no clear spot there the result is null (ns-app then shows the line in the status card).
 * R558 (user Message 31, symmetry): `centreBelow` (a box, CSS px, or null): with topCentreFirst the first spots of all
 * are the chip CENTRED on the usable view's vertical centre line, just below that box (the brain frame's planned top
 * tip, which sits on the same centre line), then at the top of the view. They come before `prefer`, so the chip goes
 * back to the centre as soon as one of them is clear again (a tip moving across it while you look around sends it to
 * the other centred spot or aside for a moment; the centred spots never move with the look). Before, the chip sat
 * beside the top tip, to its right (1600x900: x 851-1131 round a tip at x 800).
 * Returns { x, y, w, h } or null when no spot is clear (the line then is not drawn). Pure. */
export const GUIDE_FLOAT = Object.freeze({ chipMaxW: 280, gapPx: 12, bottomReservePx: 48, besideMinW: 170, besideStepPx: 20 });
export function guideFloatSpot({ usable, chipH = 40, clear = () => true, o = GUIDE_FLOAT, preferTop = false, prefer = null, topCentreFirst = false, beside = null, under = null, topBandPx = null, centreBelow = null } = {}) {
  if (!usable || ![usable.x0, usable.y0, usable.x1, usable.y1].every(Number.isFinite)) return null;
  const g = o.gapPx, w = Math.min(o.chipMaxW, usable.x1 - usable.x0 - 2 * g), h = Math.max(1, chipH);
  if (!(w > 80) || !(usable.y1 - usable.y0 > h + 2 * g)) return null;
  const cx = (usable.x0 + usable.x1) / 2 - w / 2, xl = usable.x0 + g, xr = usable.x1 - g - w;
  const yb = usable.y1 - o.bottomReservePx - h, yt = usable.y0 + g;
  // R4-polish: looking down (preferTop), the legs you are watching fill the bottom of the view, so the top spots come
  // first (run-R4-polish-0-baseline 09b: the chip sat on the moving right knee).
  const order = topCentreFirst ? [[cx, yt], [cx, yb], [xr, yt], [xl, yb]] : preferTop ? [[xr, yt], [cx, yt], [xr, yb], [cx, yb], [xl, yb]] : [[xr, yb], [cx, yb], [xr, yt], [cx, yt], [xl, yb]];
  const boxesOf = v => (Array.isArray(v) ? v : [v]).filter(b => b && [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite));
  const near = [];
  for (const bx of boxesOf(beside)) {
    // right of the arrow, then left of it, at full width; then narrower in besideStepPx steps down to besideMinW (the
    // same words on more lines: the height grows in proportion, re-measured by the HUD on the next frame)
    const minW = Math.min(w, o.besideMinW || 170), step = o.besideStepPx || 20;
    for (let ww = w; ww >= minW - 1e-9; ww -= step) {
      const hh = Math.ceil((h * w) / ww), y2 = Math.max(usable.y0 + 4, (bx.y0 + bx.y1) / 2 - hh / 2);
      for (const x2 of [bx.x1 + g / 2, bx.x0 - g / 2 - ww]) if (x2 >= usable.x0 && x2 + ww <= usable.x1 && y2 + hh <= usable.y1) near.push([x2, y2, ww, hh]);
    }
  }
  for (const bx of boxesOf(under)) {
    const x2 = (bx.x0 + bx.x1) / 2 - w / 2, y2 = bx.y1 + g / 2;
    if (x2 >= usable.x0 && x2 + w <= usable.x1 && y2 + h <= usable.y1 - o.bottomReservePx) near.push([x2, y2, w, h]);
  }
  order.unshift(...near);
  // R4-fix (review RP9): the spot the chip already has comes first while it stays clear, so the line does not jump
  // between screen places during one goal (prefer = { x, y, w? } of the last chip).
  if (prefer && Number.isFinite(prefer.x) && Number.isFinite(prefer.y)) order.unshift([prefer.x, prefer.y, Number.isFinite(prefer.w) ? prefer.w : w]);
  // R558 (Message 31): ... but the centred spot comes before it (see centreBelow above).
  // (two centred spots: just below the planned top tip, then at the top of the view, which is clear where the top tip
  // is seen lower down: in third person, or while you look up)
  if (topCentreFirst) {
    const cb = centreBelow && [centreBelow.x0, centreBelow.y0, centreBelow.x1, centreBelow.y1].every(Number.isFinite) ? centreBelow : null;
    const over = cb && cb.x0 < cx + w && cb.x1 > cx;
    order.unshift(...(over && cb.y1 + g / 2 > yt ? [[cx, cb.y1 + g / 2, w, h], [cx, yt, w, h]] : [[cx, yt, w, h]]));
  }
  for (const [x, y, ww = w, hh0 = null] of order) {
    const hh = hh0 !== null ? hh0 : ww === w ? h : Math.ceil((h * w) / ww);
    const r = { x0: x, y0: y, x1: x + ww, y1: y + hh };
    if (Number.isFinite(topBandPx) && r.y1 > usable.y0 + topBandPx) continue;
    if (y >= usable.y0 && clear(r)) return { x: Math.round(x), y: Math.round(y), w: Math.round(ww), h: Math.round(hh) };
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
 * gapPx between boxes, ring offsets tried around each anchor (ringSteps rings; requiredRingSteps for required labels).
 * R558: the caps are even numbers because labels show in twins (one on each half of the brain): 8 = all four twins
 * (arms, legs, face and neck, belly and back), 6 = the first three (was 5 / 4, which left one half a label short). */
export const LABEL_LAYOUT = Object.freeze({ maxShown: 8, maxShownCompact: 6, gapPx: 4, marginPx: 6, ringSteps: 2, requiredRingSteps: 5, requiredMaxRings: 2, sideCrossFrac: 0.15 });

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
 * R558 ("brain labels ... match on both sides"): items that share a `pair` key are twins (the same body part on the two
 * halves of the brain). Twins are one unit: they take the same offset, mirrored sideways (`mirror` +1 / -1 = which side
 * of the midline the item's anchor is on), both boxes must be clear (also of each other), and both show or neither
 * does; the unit ranks by its best member (required first) and counts as two toward maxShown. A twin whose anchor is
 * off screen is left out and the other is placed alone. Items without `pair` behave exactly as before.
 */
export function declutterLabels(items, { width, height, topPx = 0, obstacles = [], maxShown = LABEL_LAYOUT.maxShown, rules = LABEL_LAYOUT } = {}) {
  const res = new Array(items.length);
  const g = rules.gapPx, m = rules.marginPx;
  const overlap = (b, o) => Math.max(0, Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0)) * Math.max(0, Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0));
  const hide = i => { const it = items[i]; res[i] = { id: it.id, x: it.x, y: it.y, shown: false, moved: false, faded: false }; };
  // R558: placement units. Items with the same `pair` key are twins: one unit, placed and shown together (below).
  const units = [], byPair = new Map();
  for (let i = 0; i < items.length; i++) {
    const k = typeof items[i].pair === 'string' && items[i].pair !== '' ? items[i].pair : null;
    let u = k ? byPair.get(k) : null;
    if (!u) { u = []; units.push(u); if (k) byPair.set(k, u); }
    u.push(i);
  }
  const req = u => (u.some(i => items[i].required) ? 1 : 0), pri = u => u.reduce((a, i) => Math.max(a, items[i].priority || 0), -Infinity);
  units.sort((a, b) => req(b) - req(a) || pri(b) - pri(a) || a[0] - b[0]);
  const placed = [];
  let shown = 0;
  // R3-polish (INTEGRATION 7.1): one label per wording among different units; twins may share their words ("Face and
  // neck" on both halves, R558).
  const shownText = new Set();
  for (const unit of units) {
    const required = req(unit) === 1;
    const live = [];
    for (const i of unit) {
      const it = items[i];
      const onScreen = Number.isFinite(it.x) && Number.isFinite(it.y) && it.x >= 0 && it.x <= width && it.y >= topPx && it.y <= height;
      const dupText = !it.required && typeof it.text === 'string' && it.text !== '' && shownText.has(it.text);
      if (!onScreen || dupText) hide(i); else live.push(i);
    }
    if (!live.length) continue;
    if (!required && shown + live.length > maxShown) { for (const i of live) hide(i); continue; }
    const maxRingsOf = it => (Number.isFinite(it.maxRings) ? it.maxRings : required ? (Number.isFinite(rules.requiredMaxRings) ? rules.requiredMaxRings : rules.requiredRingSteps) : rules.ringSteps);
    const rings = live.reduce((a, i) => Math.min(a, maxRingsOf(items[i])), required ? rules.requiredRingSteps : rules.ringSteps);
    const dy = live.reduce((a, i) => Math.max(a, items[i].h), 0) + g, dx = live.reduce((a, i) => Math.max(a, items[i].w), 0) / 2 + g;
    const cands = [[0, 0]];
    for (let k = 1; k <= rings; k++) cands.push([0, -k * dy], [0, k * dy], [-k * dx, 0], [k * dx, 0], [-k * dx, -k * dy], [k * dx, -k * dy], [-k * dx, k * dy], [k * dx, k * dy]);
    // Twins move by the same offset mirrored: the sideways part points away from the midline for both or toward it for both.
    let s0 = 1;
    if (live.length === 2) {
      const A = items[live[0]], B = items[live[1]];
      s0 = A.mirror === 1 || A.mirror === -1 ? A.mirror : B.mirror === 1 || B.mirror === -1 ? -B.mirror : A.x >= B.x ? 1 : -1;
    }
    // R558 (user Message 31, symmetry): twins are always LEVEL. Seen straight on, their anchors (the same body part on
    // the two halves) project at one height and the labels mirror each other about the brain's midline; once the brain
    // is turned (or seen from the side) the anchors project at different heights (perspective), and both labels then
    // take the height halfway between them (and are clamped to the view with the taller one's height), so the pair
    // still reads as one row. Their sideways offsets stay mirrored round their own anchors.
    // R558 check (Message 31): only where NO level place can be near both anchors (each label within its rings of its
    // own anchor: anchors more than about 2 x rings x dy apart in height, e.g. 104 px for the 22 px labels, as when the
    // brain is turned far or seen far from the side) is the pair placed as before, each label at its own anchor height
    // with the same mirrored offset, instead of being hidden (measured: "Face and neck" twins hidden at 120 px apart):
    // the level rule must not cost the labels where it cannot be met at all. A pair that has level places, all of them
    // taken by obstacles, is handled as before (hidden, or a required pair forced and faded at its best level place).
    const twinY0 = live.length === 2 ? (items[live[0]].y + items[live[1]].y) / 2 : null;
    const twinH0 = live.length === 2 ? Math.max(items[live[0]].h, items[live[1]].h) : null;
    let pick = null, bestBad = null, levelFits = false;
    for (const level of twinY0 !== null ? [true, false] : [false]) {
      if (pick || (!level && levelFits)) break;
      const twinY = level ? twinY0 : null, twinH = level ? twinH0 : null;
      for (const [ox, oy] of cands) {
        const boxes = [];
        let bad = 0, ok = true;
        for (let n = 0; n < live.length && ok; n++) {
          const it = items[live[n]], sx = live.length === 2 ? (n === 0 ? s0 : -s0) : 1;
          const x = clampTo(it.x + sx * ox, it.w / 2 + m, Math.max(it.w / 2 + m, width - it.w / 2 - m));
          const hh = twinH !== null ? twinH : it.h;
          const y = clampTo((twinY !== null ? twinY : it.y) + oy, topPx + 2 + hh / 2, Math.max(topPx + 2 + hh / 2, height - m - hh / 2));
          const b = { x0: x - it.w / 2 - g / 2, y0: y - it.h / 2 - g / 2, x1: x + it.w / 2 + g / 2, y1: y + it.h / 2 + g / 2 };
          // R4-fix (RP1): the clamped box must still be near its anchor and on its own side of the midline.
          if (Math.abs(x - it.x) > rings * dx + 0.5 || Math.abs(y - it.y) > rings * dy + 0.5) { ok = false; break; }
          const sd = it.side && [it.side.x0, it.side.y0, it.side.dxdy].every(Number.isFinite) && (it.side.sign === 1 || it.side.sign === -1) ? it.side : null;
          if (sd) {
            const mx0 = sd.x0 + (b.y0 - sd.y0) * sd.dxdy, mx1 = sd.x0 + (b.y1 - sd.y0) * sd.dxdy;
            const cross = (Number.isFinite(rules.sideCrossFrac) ? rules.sideCrossFrac : 0) * it.w;
            if (sd.sign > 0 ? b.x0 + cross < Math.max(mx0, mx1) : b.x1 - cross > Math.min(mx0, mx1)) { ok = false; break; }
          }
          let own = 0;
          for (const o of obstacles) if (o) own += overlap(b, o);
          for (const p of placed) own += overlap(b, p);
          for (const q of boxes) own += overlap(b, q.b);
          bad += own;
          boxes.push({ i: live[n], x, y, b, bad: own });
        }
        if (!ok) continue;
        if (level) levelFits = true;
        if (bad === 0) { pick = boxes; break; }
        if (!bestBad || bad < bestBad.bad) bestBad = { boxes, bad };
      }
    }
    let forced = false;
    if (!pick && required && bestBad) { pick = bestBad.boxes; forced = true; }
    if (!pick) { for (const i of live) hide(i); continue; }
    for (const q of pick) {
      const it = items[q.i];
      placed.push(q.b);
      shown++;
      if (typeof it.text === 'string' && it.text !== '') shownText.add(it.text);
      res[q.i] = { id: it.id, x: q.x, y: q.y, shown: true, moved: q.x !== it.x || q.y !== it.y, faded: forced && (q.bad > 0 || live.length === 1) };
    }
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
  `.ns-region-label.ns-r3.ns-region-label-arm { font-size: ${R3_LABEL_FONT.leftArmPx}px; padding: ${R3_LABEL_FONT.padYPx}px ${R3_LABEL_FONT.padXPx}px; border-radius: 12px; line-height: 1.25; }`,
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
  // ns-text regionGroupLabel: "Part (brain's left half)": the part is the label, the bracket its smaller second line.
  // R558 (labels match on both sides): the second line is shown on BOTH arm labels ("Left arm / brain's right half" and,
  // mirrored, "Right arm / brain's left half"); the other labels carry one line on both halves (fewer words on the
  // brain; the info panel names the half for every area). It was on the left-arm label only.
  const full = NS_TEXT.regionGroupLabel(key, group.hemisphere);
  if (!(typeof full === 'string' && full.trim())) return null;
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(full);
  const main = m ? m[1] : full, sub = m ? m[2] : '';
  return { main, sub: leftArm || key === 'arm' ? sub : '' };
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
// R558 (genuine note R26): the floating own face is retired. 'off' is the only mode; the two old names are still
// accepted by setFaceView and createScene (an old caller or saved setting) and mean 'off'. The head and face meshes
// are still loaded: the mirror body's face and the in-place head seen from behind are built from them.
export const FACE_VIEW_MODES = Object.freeze(['off']);
export const RETIRED_FACE_VIEW_MODES = Object.freeze(['ghost', 'inset']);
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
/** R558: the area whose colour a left-arm muscle shows when no area claims it (the Space palm turn drives the forearm
 * rotators without a look at the brain): the left forearm area. */
export const ARM_FALLBACK_AREA = 'rh_forearm';
/** R558: the optogenetic halo of a glowing muscle (display choices): shell offset along the normals in world mm on your
 * body (ownMm) and on the mirror body (mirrorMm, wider because it is drawn farther away); power: alpha = (power x
 * |N.V| of the shell, clamped to 1)^2, 0 at the shell's outer edge and full near the muscle's outline; the halo colour
 * gain (x the area glow colour x the glow strength). */
export const MUSCLE_HALO = Object.freeze({ ownMm: 3, mirrorMm: 12, power: 2.5, gain: 0.7, mirrorGain: 0.6 });

/** Far-right information overlay (R14) layout mirror of the CSS (.ns-infopanel): column width min(colPx, colVw vw),
 * the bottom panel height in portrait (portraitVh), and how many caveats / citations are listed. */
// Round-2 fix V1: colMaxVh 58 -> 66 so every required field (plain lead, simulated, known, caveat, body part, movement,
// muscles, pathway) fits at 1280x720; the legend under it uses its compact key at heights <= 820 px (CSS).
// Round 3 (D3): at most maxRows value rows show by default; the rest of the card is behind a collapsed More detail.
// R558 (motor strip fills the view): in landscape the panel is a short card in the bottom-right corner (cornerVw wide,
// cornerShortVh tall; CSS mirrors --ns-info-corner-vw / --ns-info-short-maxvh), one of the two corners the motor areas
// leave free at the start; "More detail" (key R) opens the full card upward (at most colMaxVh of the height).
export const INFO_PANEL = Object.freeze({ colPx: 300, colVw: 25, gapPx: 12, portraitVh: 36, maxCaveats: 2, maxCitations: 4, colMaxVh: 66, maxRows: 4, cornerVw: 18.75, cornerShortVh: 48 });
/** R3-integrator: in portrait the top of the bottom band holds the legend (right) and the drag-to-look toast (left); the
 * information panel below them is capped to the band minus this height (CSS mirror --ns-portrait-legend-reserve). */
export const INFO_PANEL_PORTRAIT_LEGEND_PX = 172; // R3-fix (SL-3): room for the legend's map qualifier in portrait

/** Panel rectangle (CSS px) the info overlay occupies for a viewport: the short bottom-right corner card (landscape,
 * layout 'corner'; R558) or a bottom band (portrait). Other HUD elements and the orbit arrows avoid it. The card
 * opened with "More detail" (key R) grows upward past this box for as long as the player keeps it open. */
export function infoPanelRect({ width, height } = {}, topPx = 0) {
  if (!(width > 0 && height > 0)) return null;
  const g = INFO_PANEL.gapPx;
  if (width / height < 1) {
    const h = (INFO_PANEL.portraitVh / 100) * height;
    return { x0: g, y0: height - g - h, x1: width - g, y1: height - g, layout: 'portrait' };
  }
  // R558: the short corner card (bottom right). Its box depends on the view size only, never on the text.
  const w = Math.min(INFO_PANEL.colPx, (INFO_PANEL.cornerVw / 100) * width);
  const h = (INFO_PANEL.cornerShortVh / 100) * height;
  return { x0: width - g - w, y0: Math.max(topPx, height - g - h), x1: width - g, y1: height - g, layout: 'corner' };
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
    // R558: a card with more === null (ns-text reachInfoCard) has no technical layer to open.
    more = card.more === null ? null : {
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
  // R558 (Messages 55 and 56: easier to play; a learning tool): the numbered movement list (ns-app infoMoves): every
  // movement of the area with the number key that does it. The one shown now is marked and its muscles are the rows
  // below it, so the Movement row is not written a second time.
  const moves = region && Array.isArray(model.moves)
    ? model.moves.filter(m => m && Number.isInteger(m.n) && s(m.label)).map(m => ({ n: m.n, label: s(m.label), current: m.current === true, atEnd: m.atEnd === true, back: m.back === true && m.atEnd !== true }))
    : [];
  if (moves.some(m => m.current)) rows = rows.filter(r => r[0] !== INFO_ROW_LABELS.movement);
  const TM = T.moves && typeof T.moves === 'object' ? T.moves : {};
  return {
    key: s(model.key), mode: s(model.mode) || 'idle', leftArm,
    heading: s(model.heading) || T.heading,
    title: s(card && card.title) || s(model.title), tag: s(card && card.tag) || s(model.tag),
    viewed: model.viewed === 'last' ? T.viewedLast : '',
    plain,
    moves, movesHeading: moves.length ? s(TM.heading) : '', movesAtEnd: s(TM.atEnd), movesCurrent: s(TM.current), movesBack: s(TM.back),
    rows: rows.slice(0, INFO_PANEL.maxRows),
    // R558: the swatch and the meter show the area's OWN colour (calm tint -> glow), as on the brain and the muscles.
    activity: v === null ? null : { value: v, text: NsText.activityLine(v), css: NsColors.areaSwatchCss(model.regionId, v) || activityColorCss(v), meter: NsColors.areaMeterCss(model.regionId) },
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
 *   dispose, setBrainTransform, updateRegions, setRegionHints, regionHintState (R558), setInfo, setBody, setBodyFrame, updateBody, bodyVisibility, setFaceView,
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
// R558 (genuine note R33, "that's also for the mirror body"): the 2.5 mm cluster copies were chosen when the mirror
// body was small and far away (one source mm under half a pixel). Since R22 it is drawn much larger, and at that size
// the cluster copies drop the thin triangles of sheet-like face and neck muscles, which shows as holes and blotches.
// At full quality the mirror body is now drawn from the full meshes (mirrorLodFullMm 0 = no copy); the coarser copy
// used from the first reduced quality level is 3 mm instead of 4 mm. Costs GPU triangles, not frame logic.
// R558 (Message 14, "everything that should be as detailed as possible"): the mirror body keeps its full meshes through
// the render-scale and lite levels too and is simplified only from the first triangle-reducing ('lod') level, index 4,
// with the glass and the own body: the D8 order (render scale first, then passes, then triangles). The scale levels
// help a fill-limited GPU, where fewer mirror triangles saved nothing but cost detail.
export const R5_SCENE = Object.freeze({ mirrorLodFullMm: 0, mirrorQualityLodFrom: 4, mirrorLodBodyMm: 3, mirrorLodSliceMs: 4, headInPlaceFrom: 0.5, mirrorPointsPerMesh: 24, arrowCaptionPx: 8 });
/** The compass arrows (top = forward, bottom = back, left, right): ns-arrows3d COMPASS_DIRS. */
export const ARROW_DIRS = NsArrows.COMPASS_DIRS;
/** R5-bigbrain (R25 / R26; round5/R5-bigbrain-NOTES.md): motorSamples = at most this many motor-area sample points
 * (region-mesh vertices) for "never over a motor area" (the brain's edge arrows, the mirror body's place and arrows);
 * avoidCellPx / avoidDilate: their occupancy grid (CSS px cell, cells marked round each point and triangle; 2 = an 8 px
 * margin for the arrows, whose drawn hook is a little larger than their planned box); mirrorAvoidDilate: the same for the
 * mirror body's place (its arrows' rooms already keep it apart; 1 lets it fit on a phone); crosshairKeepPx: half
 * size of the box round the crosshair that no orbit arrow's CLICK AREA may come within 4 px of (an arrow obstacle).
 * R558 (Messages 55 / 56): 40 -> 8. The mirror body's top tip belongs on the middle of its frame's top side, just above
 * its head, which with a literal reflection is only 40 to 60 px above the crosshair at the start (measured: 59.8 px at
 * 1920x1080, 49.8 at 1600x900, 42.5 at 1366x768); the old 40 px box pushed that tip 86 to 116 px up, onto the brain's
 * leg areas. A tip's click area is larger than its drawn shape (about 31 px from its middle along its pointing
 * axis at 52 px), so with 8 + 4 px the crosshair mark (11 px half size) and a start look are still never on a tip. */
export const R5_BIGBRAIN = Object.freeze({ motorSamples: 12000, avoidCellPx: 4, avoidDilate: 2, mirrorAvoidDilate: 1, crosshairKeepPx: 8 });
/** R558 (Messages 55 / 56): how the brain's top / bottom arrow tips move off obstacles (ns-arrows3d FRAME_PAIR
 * overrides; display choices). With the brain just above the mirror body's head, the middle of the brain frame's bottom
 * side is where the mirror body's top tip is. The brain's bottom tip therefore goes UP the hollow of the motor strip's U
 * to the lowest place where its click area covers no motor area (inwardMaxFrac 1.6: it may pass the frame's middle;
 * measured 196 px up at 1920x1080, 170 px at 1600x900), and the pair does not move sideways off the brain's midline
 * instead (perpCost 12: a sideways move costs 24 per px, the way up 5 per px). */
export const BRAIN_TIP_RULES = Object.freeze({ ends: Object.freeze({ ...NsArrows.FRAME_PAIR.ends, inwardMaxFrac: 1.6, perpCost: 12 }) });
/** R558 (issue hunt 2: in third person the mirror body hid behind your back while its four tips were drawn on your body,
 * the top one under the crosshair, so the first click there slid the mirror body away; looking down, the brain's bottom
 * tip sat on your head). The tips are drawn on top of everything, so they are now drawn, and answer clicks, only where
 * what they belong to can be seen:
 *  - a target's whole set only while enough of the target's own frame is seen: the plane rectangle through its four tip
 *    anchors, sampled on a gridX x gridY grid; a sample is seen when it lies in front of the camera, inside the view,
 *    and the sight line to it does NOT meet your own body nearer than the target's centre (ns-collide's sphere cover of
 *    your body). Below minShare of the samples the set hides. (The brain's 16:9 frame fills the view at the start:
 *    turning the look until a side tip reaches the crosshair leaves about half of it in view, so minShare stays well
 *    under one half and a side tip can still be aimed at with the crosshair.)
 *  - each single tip only while your own body is not in front of it: sight lines through the tip's middle and its two
 *    sides across its pointing direction, hidden when your body is nearer than the tip on two of the three.
 * Checked every everyFrames frames while the camera, a pose, a plan or a target changed (a few dozen sight lines against
 * the sphere cover, about 0.1 to 4 ms; frameVis.lastMs in the arrow readback). Display choice. */
export const FRAME_VIS = Object.freeze({ minShare: 0.3, gridX: 4, gridY: 4, everyFrames: 6 });
/** R558 (issue hunt 2; Message 18: hints must look clean and deliberate, "never ... diseased-looking"): how a muscle
 * that only an opposing-action hint names is drawn: its resting tissue colour (no emission over the belly) plus a thin
 * fresnel rim (rimPower: the higher, the thinner) in its area's glow colour lightened rimWhite toward white, at rimGain.
 * Display choice. */
export const MUSCLE_HINT_LOOK = Object.freeze({ rimGain: 0.5, rimWhite: 0.35, rimPower: 5 });

/* ---- R5-scene: glow links (D17, R21) --------------------------------------------------------------------------------- */

/** Glow-link drawing (display choices; the colours and strengths come from ns-colors glowColor / glowIntensity, owned by
 * R5-access). A link is a soft additive ribbon on a gentle curve from an active brain area to one driven muscle group;
 * corePx / haloPx: half widths on screen; lift: how far the curve bows (fraction of the link length, toward world up);
 * brainFade: the first part of the link (curve parameter) fades in, so it never covers the brain area it starts on;
 * pulse: a soft brighter band travelling from the brain to the muscle (period pulseS, strength pulseAmp; none under
 * prefers-reduced-motion); maxLinks / segments: buffer sizes; mirrorAlpha: links to the mirror body are fainter (they
 * run behind the glass). */
// R558 (user Message 2: "All the connective lines might get a little confusing, you'll need a fix"): the colour of an
// area and of its muscles now carries the link (ns-colors AREA_COLORS), so the fan of ribbons (one per driven muscle
// group, on your body AND on the mirror body, up to 24 at once) is gone. mode 'one-per-area': at most ONE soft line per
// area that has just switched on, from the area to the muscle group of YOUR body it drives most, in the area's own
// colour; it shows for holdS and fades out over fadeS even while the area stays lit, and the mirror body gets none
// (its muscles light in the same colour). No line to a group nearer the camera than minTargetM (your own neck or face
// from the eyes). mode 'off' draws no line at all. Display choices.
// R558 (user Messages 48 and 56: "it's not clear which brain part is being activated by each body movement at all. So
// maybe you need to reintroduce linking lines"; the game is a learning tool): mode 'held' keeps the ONE line of a lit
// area for as long as the area is lit (it fades with the area's own level), a little thicker, and draws it to the
// MIRROR body too (mirror: true): the mirror body stands whole beside the strip, so the line "this strip part -> this
// body part" is short and always on screen, also when the part of your own body is at the camera (your left shoulder
// in the ordinary view). overBrainCore / overBrainHalo: how much of the line shows where it crosses the drawn brain
// (the core stays readable; the halo is kept low so it does not wash the areas out). Still one line per area and body.
export const GLOW_LINK = Object.freeze({
  mode: 'held', holdS: 0.5, fadeS: 0.7, coreWhite: 0.3, minTargetM: 0.45, mirror: true, own: 'no-mirror',
  corePx: 2.2, haloPx: 8, lift: 0.16, segments: 40, brainFade: 0.1, muscleFade: 0.04, pulseS: 1.1, pulseAmp: 0.35, pulseWidth: 0.12,
  maxLinks: 24, minLevel: 0.02, mirrorAlpha: 0.9, nearClipM: 0.06, overBrainCore: 0.9, overBrainHalo: 0.2,
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

/** R558: strength 0..1 of an area's one line `ageS` seconds after the area switched on. Mode 'held': 1 for as long as
 * the area is lit. Mode 'one-per-area': 1 for holdS, then a smooth fade to 0 over fadeS. 0 for a negative or non-finite
 * age, and always 0 in mode 'off'. Pure. */
export function glowLineEnvelope(ageS, o = GLOW_LINK) {
  if (o.mode === 'off' || !Number.isFinite(ageS) || ageS < 0) return 0;
  if (o.mode === 'held' || ageS <= o.holdS) return 1;
  const t = Math.min(1, (ageS - o.holdS) / Math.max(1e-6, o.fadeS));
  return 1 - t * t * (3 - 2 * t);
}

/** Normalised glow links (pure): links [{ key?, regionId, level 0..1, bodyMeshIds?: [ids] | { id: 0..1 }, colorMeshIds?:
 * [ids] | { id: 0..1 }, armMuscleKeys?: [keys] | { key: 0..1 }, armMuscleNames?: [lower-case name parts] }] -> [{ key,
 * regionId, level, body: { id: w }, colorBody: { id: w } (the muscles that take the area's colour; defaults to body),
 * armKeys: { key: w }, armNames: [..] }] (levels clamped; links below GLOW_LINK.minLevel or without a region id dropped). */
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
    const body = asMap(l.bodyMeshIds), colorBody = l.colorMeshIds ? asMap(l.colorMeshIds) : body;
    // R558 (Space dance): line false = a colour-only link (its muscles take the area's colour; no line is drawn).
    out.push({ key: typeof l.key === 'string' && l.key ? l.key : l.regionId, regionId: l.regionId, level, hint: l.hint === true, line: l.line !== false, body, colorBody, armKeys: asMap(l.armMuscleKeys),
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
      out.push({ key: l.key || l.regionId, regionId: l.regionId, level, hint: l.hint === true, armMuscleKeys: Array.isArray(l.catalog) ? l.catalog : [], armMuscleNames: names });
      continue;
    }
    let ids = {};
    try { ids = typeof bodyDrives === 'function' ? bodyDrives(l) || {} : {}; } catch { ids = {}; }
    const vals = Object.values(ids).filter(Number.isFinite), top = vals.length ? Math.max(...vals) : 0;
    const keep = {}, color = {};
    for (const [id, v] of Object.entries(ids)) {
      if (!(Number.isFinite(v) && v > 0)) continue;
      if (v >= 0.5 * top) keep[id] = v / (top || 1);
      // R558: the muscles that take the area's colour: the agonists and the stabilisers (ns-body 1 and 0.3), not the
      // antagonists' 0.08 display floor (below the glow onset anyway).
      if (v >= 0.2 * top) color[id] = v / (top || 1);
    }
    out.push({ key: l.key || l.regionId, regionId: l.regionId, level, hint: l.hint === true, bodyMeshIds: keep, colorMeshIds: color });
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
  const body = '\tif ( nsGlowRim.r + nsGlowRim.g + nsGlowRim.b > 0.0 ) { float nsGf = max( 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 0.0 ); ' +
    'totalEmissiveRadiance += nsGlowRim.rgb * pow( nsGf, max( nsGlowRim.a, 0.5 ) ); }\n';
  return { vertexShader, fragmentShader: 'uniform vec4 nsGlowRim;\n' + fragmentShader.slice(0, f) + body + fragmentShader.slice(f) };
}

/** R558 (user Message 18): the muscle LOOK shader patch (pure). Per vertex the attribute nsTendon (0 over the belly, 1 on
 * an end attached to bone) becomes the varying vNsTendon. Per fragment:
 *  - the albedo turns toward the tendon white nsMuscleTendon.rgb by vNsTendon x nsMuscleTendon.a (half as much on a
 *    glowing muscle, so the glow stays whole), and that part is a little glossier (roughness - nsMuscleShade.w x it);
 *    R558 (hunt 2): the tendon part fades out as it gets small on screen (MUSCLE_TENDON_FADE: a far body is not speckled);
 *  - a red-shifted tissue scatter, albedo x nsMuscleScatter.rgb x nsMuscleShade.z, is added to the indirect light (a
 *    muscle in shade stays warm, never grey-black; not on the tendon part, and not on a glowing muscle, where it would
 *    pull the glow colour toward red);
 *  - the LIT light (diffuse and specular, never the emission or the glow rim) is multiplied by
 *    1 - nsMuscleShade.x x (1 - nsMuscleScatter.a x glow) x (1 - |N.V|)^nsMuscleShade.y: a soft darkening toward the
 *    muscle's own outline, so the groove between two neighbouring bellies reads as a crease.
 *  - fibre striation: the albedo varies by +-nsMuscleFibre.x with a smooth noise that runs ALONG the muscle's own long
 *    axis (per-material nsFibre.xyz, object frame; nsFibre.w = 1 / streak width in object units, 0 = none) and changes
 *    across it, so a near belly shows fine lengthwise fibre streaks; it fades out where a streak would be narrower than
 *    about a pixel (fwidth between nsMuscleFibre.z and 2.5 x that), so a far body shows no shimmer; not on the tendon
 *    part and not on a glowing muscle. The same noise x nsMuscleFibre.w (view units, metres) is a tiny height for a
 *    derivative bump of the normal, so the streaks also catch the light (hook '#include <emissivemap_fragment>', after
 *    the normal is known). The coordinate is the vertex position, or the rest position nsRest when NS_FIBRE_REST is
 *    defined (the CPU-skinned left arm, so the streaks stay on the skin while it moves).
 *  - sheen: the lit specular is tinted by nsMuscleSheen.rgb (warm, a little weaker), toward white on the tendon part and
 *    on a glowing muscle: the cool sky and rim lights otherwise laid a white-blue veil over the red (mauve-grey bellies).
 * glow = smoothstep(0.02, 0.2, the largest emissive channel) (the activation glow of shadeMuscle).
 * Hooks: vertex '#include <begin_vertex>'; fragment '#include <color_fragment>', '#include <roughnessmap_fragment>',
 * '#include <aomap_fragment>' (MeshStandardMaterial r170). null when any hook or the emissive / vViewPosition names are
 * missing (the material then draws as before). */
// Smooth 3D value noise (0..1) for the fibre striation: cheap, no texture, no derivative discontinuities.
const MUSCLE_FIBRE_NOISE_GLSL = 'float nsHash3( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.yzx + 33.33 ); return fract( ( p.x + p.y ) * p.z ); }\n' +
  'float nsVNoise( vec3 x ) { vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );\n' +
  '  return mix( mix( mix( nsHash3( i ), nsHash3( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( nsHash3( i + vec3( 0.0, 1.0, 0.0 ) ), nsHash3( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),\n' +
  '    mix( mix( nsHash3( i + vec3( 0.0, 0.0, 1.0 ) ), nsHash3( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( nsHash3( i + vec3( 0.0, 1.0, 1.0 ) ), nsHash3( i + 1.0 ), f.x ), f.y ), f.z ); }\n';
/** R558 (issue hunt 2, Message 18 "never ... splotchy"): the tendon white fades with its size on screen. Measure: the
 * length of fwidth of the fragment's view position (metres the surface spans across one drawing-buffer pixel, about
 * 1.4 x the pixel's footprint). Full white below fullM, none above noneM. At 1600x900 and the 90-degree view the own
 * body seen from the eyes measures about 1 to 3 mm (unchanged), your back in third person about 5 to 6 mm (partly
 * faded) and the mirror body, 2.5 to 3.5 m away, 8 mm and more (gone): there its tendon ends were a pixel or two wide
 * and read as a white speckle over the face, chest and shoulders. Display choice. */
export const MUSCLE_TENDON_FADE = Object.freeze({ fullM: 0.004, noneM: 0.008 });
export const MUSCLE_LOOK_HOOKS = Object.freeze({
  vertex: '#include <begin_vertex>', color: '#include <color_fragment>', roughness: '#include <roughnessmap_fragment>',
  normal: '#include <emissivemap_fragment>', light: '#include <aomap_fragment>'
});
export function patchMuscleLookShaders(vertexShader, fragmentShader) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const H = MUSCLE_LOOK_HOOKS;
  if (!vertexShader.includes(H.vertex) || !fragmentShader.includes(H.color) || !fragmentShader.includes(H.roughness) || !fragmentShader.includes(H.normal) || !fragmentShader.includes(H.light)
    || !fragmentShader.includes('uniform vec3 emissive') || !fragmentShader.includes('vViewPosition') || !fragmentShader.includes('reflectedLight')) return null;
  const vs = 'attribute float nsTendon;\nvarying float vNsTendon;\nvarying vec3 vNsFib;\n#ifdef NS_FIBRE_REST\nattribute vec3 nsRest;\n#endif\n' +
    vertexShader.replace(H.vertex, `${H.vertex}\n\tvNsTendon = nsTendon;\n#ifdef NS_FIBRE_REST\n\tvNsFib = nsRest;\n#else\n\tvNsFib = position;\n#endif`);
  const color = `${H.color}
	float nsMGlow = smoothstep( 0.02, 0.2, max( emissive.r, max( emissive.g, emissive.b ) ) );
	float nsMTd = clamp( vNsTendon, 0.0, 1.0 ) * nsMuscleTendon.a * ( 1.0 - 0.5 * nsMGlow );
	nsMTd *= 1.0 - smoothstep( ${glslFloat(MUSCLE_TENDON_FADE.fullM)}, ${glslFloat(MUSCLE_TENDON_FADE.noneM)}, length( fwidth( vViewPosition ) ) );
	float nsFh = 0.0;
	if ( nsFibre.w > 0.0 && nsMuscleFibre.x > 0.0 ) {
		vec3 nsFa = nsFibre.xyz;
		vec3 nsFu = normalize( cross( nsFa, abs( nsFa.y ) < 0.9 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ) ) );
		vec3 nsFv = cross( nsFa, nsFu );
		vec2 nsFc = vec2( dot( vNsFib, nsFu ), dot( vNsFib, nsFv ) ) * nsFibre.w;
		float nsFl = dot( vNsFib, nsFa ) * nsFibre.w * nsMuscleFibre.y;
		float nsFn = nsVNoise( vec3( nsFc, nsFl ) ) * 0.65 + nsVNoise( vec3( nsFc * 2.3 + 17.0, nsFl * 1.7 ) ) * 0.35;
		float nsFfade = ( 1.0 - smoothstep( nsMuscleFibre.z, 2.5 * nsMuscleFibre.z, length( fwidth( nsFc ) ) ) ) * ( 1.0 - nsMTd ) * ( 1.0 - nsMGlow );
		diffuseColor.rgb *= 1.0 + nsMuscleFibre.x * ( nsFn * 2.0 - 1.0 ) * nsFfade;
		nsFh = nsMuscleFibre.w * nsFn * nsFfade;
	}
	diffuseColor.rgb = mix( diffuseColor.rgb, nsMuscleTendon.rgb, nsMTd );`;
  const rough = `${H.roughness}
	roughnessFactor = max( 0.2, roughnessFactor - nsMuscleShade.w * nsMTd );`;
  const bump = `if ( nsFibre.w > 0.0 && nsMuscleFibre.w > 0.0 ) {
		vec3 nsSx = dFdx( - vViewPosition ), nsSy = dFdy( - vViewPosition );
		vec3 nsR1 = cross( nsSy, normal ), nsR2 = cross( normal, nsSx );
		float nsDet = dot( nsSx, nsR1 );
		vec3 nsGrad = sign( nsDet ) * ( dFdx( nsFh ) * nsR1 + dFdy( nsFh ) * nsR2 );
		normal = normalize( abs( nsDet ) * normal - nsGrad );
	}
	${H.normal}`;
  const light = `{
		float nsMNV = clamp( abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 0.0, 1.0 );
		float nsMOcc = 1.0 - nsMuscleShade.x * ( 1.0 - nsMuscleScatter.a * nsMGlow ) * pow( 1.0 - nsMNV, nsMuscleShade.y );
		reflectedLight.indirectDiffuse += diffuseColor.rgb * nsMuscleScatter.rgb * ( nsMuscleShade.z * ( 1.0 - nsMTd ) * ( 1.0 - nsMGlow ) );
		reflectedLight.directDiffuse *= nsMOcc; reflectedLight.indirectDiffuse *= nsMOcc;
		vec3 nsMSh = nsMOcc * mix( nsMuscleSheen.rgb, vec3( 1.0 ), max( nsMTd, nsMGlow ) );
		reflectedLight.directSpecular *= nsMSh; reflectedLight.indirectSpecular *= nsMSh;
	}
	${H.light}`;
  const fs = 'uniform vec4 nsMuscleTendon;\nuniform vec4 nsMuscleShade;\nuniform vec4 nsMuscleScatter;\nuniform vec4 nsMuscleSheen;\nuniform vec4 nsMuscleFibre;\nuniform vec4 nsFibre;\n' +
    'varying float vNsTendon;\nvarying vec3 vNsFib;\n' + MUSCLE_FIBRE_NOISE_GLSL +
    fragmentShader.replace(H.color, color).replace(H.roughness, rough).replace(H.normal, bump).replace(H.light, light);
  return { vertexShader: vs, fragmentShader: fs };
}

/** R558 (user Message 22: "the fluorescent glow up should almost look like a video game power up charge"): the
 * POWER-UP shader patch (pure) for a glowing muscle (kind 'muscle') or motor area (kind 'area'). Uniforms: nsClock
 * (x = the scene clock in seconds, y = 1 under prefers-reduced-motion), nsCharge (x = the charge's start on that clock,
 * y = 1 for a calm opposing-action hint, z = 1 while the glow is on) and, for a muscle, nsChargeRest (its resting albedo)
 * and nsSweep (u = dot(fibre coordinate, nsFibre.xyz) x nsSweep.x + nsSweep.y: 0 at the origin end, 1 at the insertion
 * end; powerUpSweep). While the glow is on, per fragment: pu = ns-colors powerUpEnvelope(clock - start, u) (its GLSL
 * twin powerUpGlsl); a muscle's albedo goes from its resting colour to the glow-tinted one by pu.albedo (hook
 * '#include <color_fragment>', before the muscle look's tendon and fibre terms); the emission (the glow and its fresnel
 * rim, which glowRimPatch adds just before '#include <lights_fragment_begin>') is desaturated toward its luminance by
 * 1 - pu.sat, multiplied by pu.gain and whitened toward its brightest channel by pu.white (a white-hot core of the same
 * brightness; on an area by pu.white x POWER_UP.areaWhiteScale, so the area keeps its hue). On an area, u runs from
 * the middle of its band (the strip-coordinate run of patchRegionBorderShaders) out to its borders; without that run,
 * or without the muscle look's fibre coordinate, u = 0.5. Off (nsCharge.z = 0) the material draws exactly as before. Compose AFTER glowRimPatch and, for muscles, muscleLookPatch. null when a hook is
 * missing. */
export const POWER_UP_HOOKS = Object.freeze({ color: '#include <color_fragment>', light: '#include <lights_fragment_begin>' });
export function patchPowerUpShaders(vertexShader, fragmentShader, kind = 'muscle') {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const H = POWER_UP_HOOKS;
  if (!fragmentShader.includes(H.color) || !fragmentShader.includes(H.light) || !fragmentShader.includes('totalEmissiveRadiance')) return null;
  const muscle = kind === 'muscle';
  let u = '0.5';
  if (muscle && fragmentShader.includes('varying vec3 vNsFib') && fragmentShader.includes('uniform vec4 nsFibre')) u = 'dot( vNsFib, nsFibre.xyz ) * nsSweep.x + nsSweep.y';
  else if (!muscle && fragmentShader.includes('float nsSv') && fragmentShader.includes('nsHiS')) {
    u = 'abs( nsSv - 0.5 * ( clamp( nsLo, 0.0, 1.0 ) + clamp( nsHiS, 0.0, 1.0 ) ) ) / max( 0.5 * ( clamp( nsHiS, 0.0, 1.0 ) - clamp( nsLo, 0.0, 1.0 ) ), 1e-4 )';
  }
  const color = `${H.color}\n\tvec4 nsPu = nsCharge.z > 0.5 ? nsPowerUp( nsClock.x - nsCharge.x, ${u}, nsCharge.y, nsClock.y ) : vec4( 1.0, 0.0, 1.0, 1.0 );` +
    (muscle ? '\n\tdiffuseColor.rgb = mix( nsChargeRest, diffuseColor.rgb, nsPu.w );' : '');
  const light = '\tif ( nsCharge.z > 0.5 ) {\n' +
    '\t\tfloat nsPuL = dot( totalEmissiveRadiance, vec3( 0.2126, 0.7152, 0.0722 ) );\n' +
    '\t\ttotalEmissiveRadiance = mix( vec3( nsPuL ), totalEmissiveRadiance, nsPu.z ) * nsPu.x;\n' +
    `\t\ttotalEmissiveRadiance = mix( totalEmissiveRadiance, vec3( max( totalEmissiveRadiance.r, max( totalEmissiveRadiance.g, totalEmissiveRadiance.b ) ) ), clamp( nsPu.y${muscle ? '' : ` * ${POWER_UP.areaWhiteScale.toFixed(4)}`}, 0.0, 1.0 ) );\n` +
    `\t}\n${H.light}`;
  const head = 'uniform vec4 nsClock;\nuniform vec4 nsCharge;\n' + (muscle ? 'uniform vec3 nsChargeRest;\nuniform vec2 nsSweep;\n' : '') + powerUpGlsl('nsPowerUp') + '\n';
  return { vertexShader, fragmentShader: head + fragmentShader.replace(H.color, color).replace(H.light, light) };
}

/** R558 (Message 22): the trunk axis (source mm, BodyParts3D frame: the midline x = 0, y = -40, from the hips at z = 880
 * to the shoulders at z = 1360) that tells a muscle's ORIGIN end from its insertion end for the power-up sweep: the end
 * nearer this axis is the proximal one, where a limb muscle arises. A rough display rule (it does not read the atlas's
 * own attachment records); on the trunk and the face either direction is possible. */
export const POWER_UP_TRUNK = Object.freeze({ y: -40, z0: 880, z1: 1360, endShare: 0.08 });
/** Sweep coefficients [a, b] of a muscle mesh (pure): u = dot(p, axis) x a + b is 0 at the end nearer the trunk axis
 * (POWER_UP_TRUNK; the mean of the vertices within endShare of the length from each end) and 1 at the other end.
 * positions: source mm (xyz); axis: unit [x, y, z] (fibreAxis). null for a degenerate mesh. */
export function powerUpSweep(positions, axis, trunk = POWER_UP_TRUNK) {
  if (!positions || positions.length < 9 || !axis || axis.length !== 3) return null;
  const n = Math.floor(positions.length / 3), ax = axis[0], ay = axis[1], az = axis[2];
  let lo = Infinity, hi = -Infinity;
  for (let v = 0; v < n; v++) { const p = positions[3 * v] * ax + positions[3 * v + 1] * ay + positions[3 * v + 2] * az; if (p < lo) lo = p; if (p > hi) hi = p; }
  const span = hi - lo;
  if (!(span > 1e-6) || !Number.isFinite(span)) return null;
  const e = [[0, 0, 0, 0], [0, 0, 0, 0]], cut = trunk.endShare;
  for (let v = 0; v < n; v++) {
    const x = positions[3 * v], y = positions[3 * v + 1], z = positions[3 * v + 2];
    const t = (x * ax + y * ay + z * az - lo) / span;
    const k = t <= cut ? 0 : t >= 1 - cut ? 1 : -1;
    if (k >= 0) { e[k][0] += x; e[k][1] += y; e[k][2] += z; e[k][3]++; }
  }
  const dist = c => {
    if (!(c[3] > 0)) return Infinity;
    const x = c[0] / c[3], y = c[1] / c[3], z = c[2] / c[3];
    const dz = z < trunk.z0 ? trunk.z0 - z : z > trunk.z1 ? z - trunk.z1 : 0;
    return Math.hypot(x, y - trunk.y, dz);
  };
  return dist(e[0]) <= dist(e[1]) ? [1 / span, -lo / span] : [-1 / span, hi / span];
}

/** R558 (Message 18): the long axis of a muscle mesh (pure): the principal direction of its vertex cloud (power
 * iteration on the covariance; every `stride`-th vertex). These meshes run along their fibres, so it is the
 * striation direction of patchMuscleLookShaders. Returns [x, y, z] unit, or null for a degenerate cloud. */
export function fibreAxis(positions, stride = 2) {
  const n = Math.floor(positions.length / 3);
  if (n < 3) return null;
  let cx = 0, cy = 0, cz = 0, k = 0;
  for (let v = 0; v < n; v += stride, k++) { cx += positions[3 * v]; cy += positions[3 * v + 1]; cz += positions[3 * v + 2]; }
  cx /= k; cy /= k; cz /= k;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let v = 0; v < n; v += stride) {
    const x = positions[3 * v] - cx, y = positions[3 * v + 1] - cy, z = positions[3 * v + 2] - cz;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  let a = [1, 1, 1];
  for (let it = 0; it < 32; it++) {
    const b = [xx * a[0] + xy * a[1] + xz * a[2], xy * a[0] + yy * a[1] + yz * a[2], xz * a[0] + yz * a[1] + zz * a[2]];
    const l = Math.hypot(b[0], b[1], b[2]);
    if (!(l > 1e-12)) return null;
    a = [b[0] / l, b[1] / l, b[2] / l];
  }
  return a.every(Number.isFinite) ? a : null;
}

/** R558 (user Messages 24 and 29, the comic ink of the bodies): the per-vertex HATCH FRAME of a muscle or bone mesh
 * (pure). Ink lines along a muscle's fibres (or a bone's long axis) are the level lines of an angle that runs ROUND the
 * mesh's long axis: each vertex gets the direction from the centre of its own cross-section to it, measured in that
 * cross-section's own spread (so a flat sheet is mapped round like a tube and its broad faces get lines, not just its
 * edges), and N lines are drawn at equal steps of that angle. On a fusiform belly the lines run along it and converge
 * into the tendon, as fibres do; on a sheet they fan along its long axis. Object-anchored (the attribute rides the
 * mesh), so nothing swims when the camera turns.
 *  - axis: fibreAxis (the principal direction); u, v: a fixed basis across it; `bins` slices between the 1st and 99th
 *    percentile along the axis, each with its centroid and its spread (rms) along u and v, smoothed 1-2-1 and filled
 *    from neighbours where a slice holds fewer than minCount vertices; per vertex the slice values are interpolated.
 *  - N: the perimeter of the 75th-percentile slice (the ellipse with semi-axes sqrt(2) x the spreads) / spacingMm,
 *    rounded to a multiple of 4 (at least 4): every coarser line level (every 2nd, every 4th line) then also wraps
 *    round without a seam.
 * Returns { attr: Float32Array(4 n) = [qx, qy, along (mm), N] per vertex, N, axis } or null for a degenerate mesh. */
export function hatchFrame(positions, { spacingMm = 3, bins = 16, minCount = 4 } = {}) {
  const n = positions ? Math.floor(positions.length / 3) : 0;
  const a = n >= 8 ? fibreAxis(positions, 1) : null;
  if (!a) return null;
  const ref = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [a[1] * ref[2] - a[2] * ref[1], a[2] * ref[0] - a[0] * ref[2], a[0] * ref[1] - a[1] * ref[0]];
  const ul = Math.hypot(u[0], u[1], u[2]); u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  const t = new Float32Array(n), pu = new Float32Array(n), pv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    t[i] = x * a[0] + y * a[1] + z * a[2]; pu[i] = x * u[0] + y * u[1] + z * u[2]; pv[i] = x * v[0] + y * v[1] + z * v[2];
  }
  const st = Float32Array.from(t).sort();
  const lo = st[Math.floor(0.01 * (n - 1))], hi = st[Math.ceil(0.99 * (n - 1))];
  if (!(hi - lo > 1e-6)) return null;
  const B = bins, cnt = new Float64Array(B), su = new Float64Array(B), sv = new Float64Array(B), suu = new Float64Array(B), svv = new Float64Array(B);
  const binOf = s => Math.min(B - 1, Math.max(0, Math.floor((s - lo) / (hi - lo) * B)));
  for (let i = 0; i < n; i++) { const k = binOf(t[i]); cnt[k]++; su[k] += pu[i]; sv[k] += pv[i]; }
  const cu = new Float64Array(B), cv = new Float64Array(B), ru = new Float64Array(B), rv = new Float64Array(B);
  for (let k = 0; k < B; k++) if (cnt[k] > 0) { cu[k] = su[k] / cnt[k]; cv[k] = sv[k] / cnt[k]; }
  for (let i = 0; i < n; i++) { const k = binOf(t[i]); suu[k] += (pu[i] - cu[k]) ** 2; svv[k] += (pv[i] - cv[k]) ** 2; }
  for (let k = 0; k < B; k++) if (cnt[k] > 0) { ru[k] = Math.sqrt(suu[k] / cnt[k]); rv[k] = Math.sqrt(svv[k] / cnt[k]); }
  const ok = k => cnt[k] >= minCount;
  for (let k = 0; k < B; k++) {
    if (ok(k)) continue;
    let j = 1; while (j < B && !((k - j >= 0 && ok(k - j)) || (k + j < B && ok(k + j)))) j++;
    const s = k - j >= 0 && ok(k - j) ? k - j : k + j < B && ok(k + j) ? k + j : -1;
    if (s < 0) return null;
    cu[k] = cu[s]; cv[k] = cv[s]; ru[k] = ru[s]; rv[k] = rv[s];
  }
  const sm = arr => { const o = new Float64Array(B); for (let k = 0; k < B; k++) o[k] = (arr[Math.max(0, k - 1)] + 2 * arr[k] + arr[Math.min(B - 1, k + 1)]) / 4; return o; };
  const Cu = sm(cu), Cv = sm(cv), Ru = sm(ru), Rv = sm(rv);
  const per = [];
  for (let k = 0; k < B; k++) { const A = Math.SQRT2 * Ru[k], Bb = Math.SQRT2 * Rv[k]; per.push(Math.PI * (3 * (A + Bb) - Math.sqrt(Math.max(0, (3 * A + Bb) * (A + 3 * Bb))))); }
  per.sort((x, y) => x - y);
  const N = 4 * Math.max(1, Math.round(per[Math.floor(0.75 * (B - 1))] / (4 * spacingMm)));
  const attr = new Float32Array(4 * n);
  for (let i = 0; i < n; i++) {
    const f = Math.min(B - 1, Math.max(0, (t[i] - lo) / (hi - lo) * B - 0.5)), k0 = Math.floor(f), k1 = Math.min(B - 1, k0 + 1), w = f - k0;
    const c0 = Cu[k0] + (Cu[k1] - Cu[k0]) * w, c1 = Cv[k0] + (Cv[k1] - Cv[k0]) * w;
    const s0 = Math.max(1e-3, Ru[k0] + (Ru[k1] - Ru[k0]) * w), s1 = Math.max(1e-3, Rv[k0] + (Rv[k1] - Rv[k0]) * w);
    let qx = (pu[i] - c0) / s0, qy = (pv[i] - c1) / s1;
    const ql = Math.hypot(qx, qy);
    if (ql > 1e-6) { qx /= ql; qy /= ql; } else { qx = 1; qy = 0; }
    attr[4 * i] = qx; attr[4 * i + 1] = qy; attr[4 * i + 2] = t[i]; attr[4 * i + 3] = N;
  }
  return { attr, N, axis: a };
}

/** R558 (user Messages 25 to 29, Borderlands-style comic shading of the bodies; style guide of the build brief): the
 * COMIC patch (pure) for the lit MeshStandardMaterial of a muscle (kind 'muscle', composed after the muscle look and the
 * power-up) or a bone (kind 'bone'). It runs after the lights are summed (hook '#include <aomap_fragment>'), so it reads
 * the final lit colour of every other patch (tissue tones, crease, sheen, the outline pass's soft shading comes later
 * on screen) and never touches the emission (the activation glow and its rim stay exactly as they are).
 *  1. BANDS. The light factor L = luminance(direct + indirect diffuse) / luminance(albedo) is mapped to four tone bands
 *     (nsCelLv: deep shadow, mid, light, highlight, as factors of the albedo; on bone and tendon parts the highlight is
 *     nsCelSpecAt.y and the deep and mid tones nsCelSpecAt.z and .w, a light grey: BODY_CEL.boneLevels) at the
 *     thresholds nsCelBand.xyz, each
 *     transition a smoothstep of half-width max(nsCelBand.w, 0.75 fwidth(L)) (narrow but anti-aliased, never a hard
 *     pixel step; on a far figure, over the ink's fade distance nsInkFar.xy, the half-width widens to nsInkFar.z so its
 *     bands become soft tonal shading instead of blotches); the light's own hue is kept. The deep band goes neutral
 *     and a touch cool (nsCelDeep: rgb tint, a = how far it is desaturated), never murky brown-red.
 *  2. RIM. A crisp cool rim band where 1 - |N.V| passes nsCelRim.x (anti-aliased), on the side the camera's rim light
 *     comes from (nsCelRimDir, view space), adding nsCelRim.y x albedo x the rim colour (nsCelRimCol).
 *  3. SPECULAR. The direct specular becomes a flat, crisp highlight SHAPE: its luminance through a smoothstep at
 *     nsCelSpec.x on a muscle belly, nsCelSpecAt.x on a tendon part or bone (half-width nsCelSpec.y or the pixel
 *     width), times nsCelSpec.z on a belly, nsCelSpec.w on tendon and bone, in the light's own colour.
 *     GLOSS (R558, user Message 54, "a bit of shine, a bit of glossiness"): inside that shape a brighter CORE where the
 *     luminance passes nsCelGloss.x times the shape's threshold (plus nsCelGloss.y on a belly, .z on tendon and bone),
 *     and round both a SMOOTH share of the real highlight (nsCelGloss2.x x the specular, its luminance kept under
 *     nsCelGloss2.y), so the highlight has a soft falloff like a polished surface instead of one flat patch. The two
 *     crisp steps fade out where the normal turns by more than nsCelGloss2.z radians per pixel (gone at twice that): a
 *     highlight that would be a pixel or two wide (a finger bone, a far figure's bumps) is left out, never a sparkle.
 *  4. INK (attribute nsHatch from hatchFrame: the cross-section direction, the position along the axis in mm, the
 *     line count N). Lines are the level lines of h = N x angle / 2 pi, drawn with an analytic pixel width (no texture,
 *     no stair steps) and broken into strokes of varying length along the axis. Lines are kept at least nsInkLine.x
 *     pixels apart by drawing a coarser LEVEL as the figure gets smaller (every 2nd line, every 4th line: a subset of
 *     the same object-anchored lines, the in-between ones fading, so nothing jumps or swims); past the coarsest level
 *     allowed the ink fades out, so a far or small figure (the mirror body at its start distance) stays clean; it also
 *     fades with the distance from the camera (nsInkFar.xy metres), whatever the window size. Off
 *     when nsInkLine.w = 0 (the coarse quality levels).
 *      - fibre striation on a muscle (Message 24): levels 0 to 1, nsInkLine.y px wide, nsInkMix.x opacity; on the
 *        tendon part every 4th line only, at nsInkMix.w (a few long fine strokes on the pearly white);
 *      - hatching in the shadow bands (style guide): levels 0 to 2, one level finer in the deep band (denser where
 *        darker), nsInkLine.z px wide, nsInkMix.y opacity x the shadow depth (none in the light bands);
 *      - bone grain (Message 24): a fine ink stipple of 3D value noise in the bone's own frame (cells nsInkStip.x mm,
 *        dots above nsInkStip.y), nsInkMix.z opacity (more in shadow), fading out where a cell is under nsInkStip.z px;
 *        bones get the shadow hatching along their long axis but no striation.
 *     A glowing muscle keeps its glow clean (ink x (1 - 0.85 glow)). Ink colour nsInk.rgb (linear), the style guide's
 *     near-black.
 *  5. HDR (muscles with the power-up patch): while the HDR picture is on, the power-up peaks (gain nsPu.x above
 *     nsHdrBoost.y) brighten the emission by nsHdrBoost.x x the excess (HDR_BLOOM.muscleBoost), so the cores bloom.
 * Hooks: vertex '#include <begin_vertex>', fragment '#include <aomap_fragment>'. null when a hook is missing. */
export const COMIC_HOOKS = Object.freeze({ vertex: '#include <begin_vertex>', light: '#include <aomap_fragment>' });
/* Anti-aliased coverage of the level lines of h (lines at integer h / 2^l), sp0 = pixels between neighbouring lines of
 * level 0, lf = log2(min spacing / sp0) = the level needed so lines are at least the minimum spacing apart, maxL the
 * coarsest level allowed, w the line width in pixels. Between two levels the in-between lines fade (the coarser
 * level's lines are a subset of the finer one's, so nothing jumps: object-anchored); beyond maxL the lines fade out. */
const COMIC_LINE_GLSL = `float nsLineCov( float h, float sp0, float lf, float maxL, float w ) {
	float l = clamp( lf, 0.0, maxL ), l0 = floor( l ), t = l - l0;
	float s0 = exp2( l0 ), s1 = 2.0 * s0;
	float d0 = abs( fract( h / s0 + 0.5 ) - 0.5 ) * sp0 * s0, d1 = abs( fract( h / s1 + 0.5 ) - 0.5 ) * sp0 * s1;
	float c = mix( 1.0 - smoothstep( w - 0.5, w + 0.5, d0 ), 1.0 - smoothstep( w - 0.5, w + 0.5, d1 ), t );
	return c * ( 1.0 - smoothstep( maxL, maxL + 0.6, lf ) );
}
`;
export function patchComicShaders(vertexShader, fragmentShader, kind = 'muscle') {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const H = COMIC_HOOKS;
  if (!vertexShader.includes(H.vertex) || !fragmentShader.includes(H.light) || !fragmentShader.includes('vViewPosition') || !fragmentShader.includes('reflectedLight')) return null;
  const muscle = kind === 'muscle';
  const tendon = muscle && fragmentShader.includes('varying float vNsTendon');
  const vs = 'attribute vec4 nsHatch;\nvarying vec4 vNsHatch;\nvarying vec3 vNsObj;\n' +
    vertexShader.replace(H.vertex, `${H.vertex}\n\tvNsHatch = nsHatch;\n\tvNsObj = position;`);
  const light = `${H.light}
	{
		const vec3 nsLw = vec3( 0.2126, 0.7152, 0.0722 );
		vec3 nsDif = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
		float nsAlb = max( dot( diffuseColor.rgb, nsLw ), 1e-4 );
		float nsL = dot( nsDif, nsLw ) / nsAlb;
		float nsCw = max( mix( nsCelBand.w, nsInkFar.z, smoothstep( nsInkFar.x, nsInkFar.y, length( vViewPosition ) ) ), 0.75 * fwidth( nsL ) );
		float nsB1 = smoothstep( nsCelBand.x - nsCw, nsCelBand.x + nsCw, nsL );
		float nsB2 = smoothstep( nsCelBand.y - nsCw, nsCelBand.y + nsCw, nsL );
		float nsB3 = smoothstep( nsCelBand.z - nsCw, nsCelBand.z + nsCw, nsL );
		float nsTd = ${tendon ? 'clamp( vNsTendon, 0.0, 1.0 )' : muscle ? '0.0' : '1.0'};
		float nsLv = mix( mix( mix( mix( nsCelLv.x, nsCelSpecAt.z, nsTd ), mix( nsCelLv.y, nsCelSpecAt.w, nsTd ), nsB1 ), nsCelLv.z, nsB2 ), mix( nsCelLv.w, nsCelSpecAt.y, nsTd ), nsB3 );
		vec3 nsCol = nsL > 1e-3 ? nsDif * ( nsLv / nsL ) : diffuseColor.rgb * nsLv;
		nsCol = mix( nsCol, vec3( dot( nsCol, nsLw ) ) * nsCelDeep.rgb, nsCelDeep.a * ( 1.0 - nsB1 ) );
		vec3 nsN = normalize( normal ), nsV = normalize( vViewPosition );
		float nsF = 1.0 - clamp( abs( dot( nsN, nsV ) ), 0.0, 1.0 );
		float nsFw = max( fwidth( nsF ), 1e-4 );
		float nsRimSide = smoothstep( -0.15, 0.45, dot( normalize( nsN.xy + vec2( 1e-5 ) ), nsCelRimDir.xy ) );
		nsCol += diffuseColor.rgb * nsCelRimCol.rgb * ( nsCelRim.y * smoothstep( nsCelRim.x - nsFw, nsCelRim.x + nsFw, nsF ) * nsRimSide );
		float nsGl = ${muscle ? 'smoothstep( 0.02, 0.2, max( emissive.r, max( emissive.g, emissive.b ) ) )' : '0.0'};
		vec3 nsSp = reflectedLight.directSpecular;
		float nsS = dot( nsSp, nsLw );
		float nsSw = max( nsCelSpec.y, fwidth( nsS ) );
		float nsSa = mix( nsCelSpec.x, nsCelSpecAt.x, nsTd );
		float nsSk = nsSa * nsCelGloss.x;
		float nsGk = 1.0 - smoothstep( nsCelGloss2.z, 2.0 * nsCelGloss2.z, length( fwidth( nsN ) ) );
		float nsHi = smoothstep( nsSa - nsSw, nsSa + nsSw, nsS ) * mix( nsCelSpec.z, nsCelSpec.w, nsTd )
			+ smoothstep( nsSk - nsSw, nsSk + nsSw, nsS ) * mix( nsCelGloss.y, nsCelGloss.z, nsTd );
		vec3 nsSpec = ( nsS > 1e-5 ? nsSp / nsS : vec3( 1.0 ) ) * ( nsHi * nsGk + min( nsS, nsCelGloss2.y ) * nsCelGloss2.x );
		float nsInkA = 0.0;
		vec2 nsQ = vNsHatch.xy;
		float nsQq = dot( nsQ, nsQ );
		vec2 nsDx = dFdx( nsQ ), nsDy = dFdy( nsQ ); // derivatives outside the branch below (defined in every lane)
		${muscle ? '' : `vec3 nsSc = vNsObj / nsInkStip.x;
		float nsSn = nsVNoise( nsSc );
		float nsSf = max( fwidth( nsSn ), 1e-4 );
		float nsCellPx = 1.0 / max( length( fwidth( nsSc ) ), 1e-5 );`}
		if ( nsInkLine.w > 0.5 && vNsHatch.w > 0.5 && nsQq > 1e-6 ) {
			float nsK = vNsHatch.w * 0.15915494;
			float nsH = atan( nsQ.y, nsQ.x ) * nsK;
			float nsHp = ( abs( nsQ.x * nsDx.y - nsQ.y * nsDx.x ) + abs( nsQ.x * nsDy.y - nsQ.y * nsDy.x ) ) / nsQq * nsK + 1e-5;
			float nsSp0 = 1.0 / nsHp;
			float nsLf = log2( nsInkLine.x / nsSp0 );
			float nsLine = floor( nsH * 0.25 + 0.5 );
			float nsStroke = fract( vNsHatch.z / nsInkStroke.x + fract( sin( nsLine * 12.9898 ) * 43758.5453 ) * 7.0 );
			float nsDash = smoothstep( 0.0, nsInkStroke.y, nsStroke ) * ( 1.0 - smoothstep( 1.0 - nsInkStroke.z, 1.0, nsStroke ) );
			float nsShadow = ( 1.0 - nsB2 ) * 0.5 + ( 1.0 - nsB1 ) * 0.5;
			${muscle ? `float nsFib = nsLineCov( nsH, nsSp0, nsLf, 1.0, nsInkLine.y ) * mix( nsInkMix.x, 0.0, nsTd );
			float nsTen = nsLineCov( nsH * 0.25, 4.0 * nsSp0, nsLf - 2.0, 0.0, nsInkLine.y ) * nsInkMix.w * nsTd;
			nsInkA = max( nsFib, nsTen ) * nsDash;` : ''}
			float nsHat = mix( nsLineCov( nsH, nsSp0, nsLf, 2.0, nsInkLine.z ), nsLineCov( nsH, nsSp0, nsLf - 1.0, 2.0, nsInkLine.z ), 1.0 - nsB1 );
			nsInkA = max( nsInkA, nsHat * nsInkMix.y * nsShadow * mix( nsDash, 1.0, 0.5 ) );
			${muscle ? '' : `float nsDot = smoothstep( nsInkStip.y - nsSf, nsInkStip.y + nsSf, nsSn ) * smoothstep( nsInkStip.z, 1.6 * nsInkStip.z, nsCellPx );
			nsInkA = max( nsInkA, nsDot * nsInkMix.z * ( 0.6 + 0.8 * nsShadow ) );`}
		}
		nsInkA *= ( 1.0 - 0.85 * nsGl ) * ( 1.0 - smoothstep( nsInkFar.x, nsInkFar.y, length( vViewPosition ) ) );
		reflectedLight.directDiffuse = mix( nsCol, nsInk.rgb, nsInkA );
		reflectedLight.indirectDiffuse = vec3( 0.0 );
		reflectedLight.directSpecular = nsSpec * ( 1.0 - nsInkA );
		reflectedLight.indirectSpecular *= ( 1.0 - nsInkA );
	}${muscle && fragmentShader.includes('vec4 nsPu =') && fragmentShader.includes('uniform vec4 nsCharge') ? `
	if ( nsCharge.z > 0.5 ) totalEmissiveRadiance *= 1.0 + nsHdrBoost.x * max( nsPu.x - nsHdrBoost.y, 0.0 );` : ''}`;
  const noise = (fragmentShader.includes('float nsVNoise(') ? '' : MUSCLE_FIBRE_NOISE_GLSL) + COMIC_LINE_GLSL;
  const fs = 'uniform vec4 nsCelBand;\nuniform vec4 nsCelLv;\nuniform vec4 nsCelDeep;\nuniform vec4 nsCelRim;\nuniform vec4 nsCelRimCol;\nuniform vec4 nsCelRimDir;\nuniform vec4 nsCelSpec;\nuniform vec4 nsCelSpecAt;\nuniform vec4 nsCelGloss;\nuniform vec4 nsCelGloss2;\n' +
    'uniform vec4 nsInk;\nuniform vec4 nsInkLine;\nuniform vec4 nsInkMix;\nuniform vec4 nsInkStroke;\nuniform vec4 nsInkStip;\nuniform vec4 nsHdrBoost;\nuniform vec4 nsInkFar;\nvarying vec4 vNsHatch;\nvarying vec3 vNsObj;\n' + noise +
    fragmentShader.replace(H.light, light);
  return { vertexShader: vs, fragmentShader: fs };
}

/** R558 (Message 18): per-vertex tendon weight of a muscle from its stack display geometry (pure). rest / full: the
 * drawn positions without and with the full stack display (ns-body: lift plus fill, both ZERO on the vertices the stack
 * rule anchors on bone, ramping up over the belly). d = |full - rest| per vertex, ref = its 75th percentile (the belly's
 * displacement); anchored = 1 - smoothstep(0, share x ref, d): 1 on an anchored vertex, falling to 0 a few millimetres in.
 * Anchored alone is not a tendon: the stack also anchors a belly that LIES on bone along its length (tibialis anterior
 * on the tibia, the lower gluteus maximus over the ischium, the deltoid over the humerus), and those bellies turned
 * grey-white over half their length. So the weight is anchored x endness, where endness says "this is where the
 * muscle narrows into its tendon or ends": along the mesh's long axis (fibreAxis; s = position scaled to -1..1 between
 * its endPercentile and 1 - endPercentile values) the mesh is cut into `bins` slices, each slice's spread across the
 * axis (rms distance from the slice centre) is compared with the widest slice; a slice narrower than thinFrom .. thinTo
 * of it counts as tendon (a fusiform belly narrowing into a cord, a fan converging on its insertion), away from the
 * middle of the muscle (gateFrom .. gateTo of |s|); and the very tips (tipFrom .. tipTo of |s|) always count (every
 * muscle ends on its attachment, even a broad one such as a midline origin). A broad, long sheet (widest slice spread
 * / length from sheetFrom .. sheetTo and length from sheetLenFrom .. sheetLenTo mm: the trapezius parts, the external
 * oblique, the gluteus maximus, the pectoralis major) counts as end everywhere it is anchored, since a sheet attaches
 * through aponeuroses along whole borders (a midline origin, the rectus sheath), not only at the tips of its long
 * axis; the thickness test below then keeps only its thin, aponeurotic parts. Last, where `indices` are given, the
 * weight is kept only where the muscle is THIN (tendonThickness: the depth to the opposite surface of the same mesh,
 * full below thinMm, none from thickMm): a tendon or aponeurosis is a cord or sheet a few millimetres thick, a belly is
 * not, so a thick belly the stack anchors as a whole end cap (the lower gluteus maximus) stays muscle-coloured.
 * Then smoothed over the surface
 * (smoothPasses neighbour means over `indices`, when given). A geometric estimate from the anchor rule and the mesh
 * shape, not a dissection record of where tendon tissue begins. Returns Float32Array(vertexCount) (all 0 when nothing
 * moved). */
export const TENDON_FROM_STACK = Object.freeze({
  share: 0.22, percentile: 0.75, smoothPasses: 3,
  endPercentile: 0.02, bins: 24, thinFrom: 0.3, thinTo: 0.55, gateFrom: 0.15, gateTo: 0.35, tipFrom: 0.82, tipTo: 0.97,
  sheetFrom: 0.08, sheetTo: 0.12, sheetLenFrom: 110, sheetLenTo: 160,
  thinMm: 4, thickMm: 9, cellMm: 3, stepMm: 1.5
});
/** The endness of tendonFromStack per vertex (pure; Float32Array(vertexCount), or null for a degenerate mesh). */
export function tendonEndness(rest, o = TENDON_FROM_STACK) {
  const n = Math.floor(rest.length / 3);
  const a = n >= 8 && o && o.bins > 1 ? fibreAxis(rest, 2) : null;
  if (!a) return null;
  const pr = new Float32Array(Math.ceil(n / 4));
  for (let v = 0, j = 0; v < n; v += 4, j++) pr[j] = rest[3 * v] * a[0] + rest[3 * v + 1] * a[1] + rest[3 * v + 2] * a[2];
  pr.sort();
  const lo = pr[Math.floor(o.endPercentile * (pr.length - 1))], hi = pr[Math.ceil((1 - o.endPercentile) * (pr.length - 1))];
  if (!(hi - lo > 1e-6)) return null;
  const B = o.bins, s = new Float32Array(n), bin = new Int32Array(n);
  const cnt = new Float64Array(B), sx = new Float64Array(B), sy = new Float64Array(B), sz = new Float64Array(B), st = new Float64Array(B), r2 = new Float64Array(B);
  for (let v = 0, i = 0; v < n; v++, i += 3) {
    const t = rest[i] * a[0] + rest[i + 1] * a[1] + rest[i + 2] * a[2];
    const sv = Math.max(-1, Math.min(1, 2 * (t - lo) / (hi - lo) - 1));
    const k = Math.min(B - 1, Math.floor((sv + 1) / 2 * B));
    s[v] = sv; bin[v] = k; cnt[k]++; sx[k] += rest[i]; sy[k] += rest[i + 1]; sz[k] += rest[i + 2]; st[k] += t;
  }
  for (let v = 0, i = 0; v < n; v++, i += 3) {
    const k = bin[v], c = cnt[k];
    const dx = rest[i] - sx[k] / c, dy = rest[i + 1] - sy[k] / c, dz = rest[i + 2] - sz[k] / c;
    const dt = rest[i] * a[0] + rest[i + 1] * a[1] + rest[i + 2] * a[2] - st[k] / c;
    r2[k] += Math.max(0, dx * dx + dy * dy + dz * dz - dt * dt);
  }
  const r = new Float64Array(B);
  for (let k = 0; k < B; k++) r[k] = cnt[k] > 0 ? Math.sqrt(r2[k] / cnt[k]) : 0;
  // A slice with almost no vertices says little: it takes its nearer filled neighbour; then a 1-2-1 smoothing.
  const minCount = Math.max(3, n / (B * 20));
  for (let k = 0; k < B; k++) if (cnt[k] < minCount) { let j = 1; while (j < B && !((k - j >= 0 && cnt[k - j] >= minCount) || (k + j < B && cnt[k + j] >= minCount))) j++; r[k] = k - j >= 0 && cnt[k - j] >= minCount ? r[k - j] : k + j < B ? r[k + j] : r[k]; }
  const rs = new Float64Array(B);
  for (let k = 0; k < B; k++) rs[k] = (r[Math.max(0, k - 1)] + 2 * r[k] + r[Math.min(B - 1, k + 1)]) / 4;
  let rmax = 0;
  for (let k = 0; k < B; k++) if (rs[k] > rmax) rmax = rs[k];
  if (!(rmax > 1e-6)) return null;
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  // A broad, long sheet: anchored anywhere counts as an attachment (see above).
  const sheet = smooth(o.sheetFrom, o.sheetTo, rmax / (hi - lo)) * smooth(o.sheetLenFrom, o.sheetLenTo, hi - lo);
  const thin = new Float64Array(B);
  for (let k = 0; k < B; k++) thin[k] = 1 - smooth(o.thinFrom, o.thinTo, rs[k] / rmax);
  const e = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const f = (s[v] + 1) / 2 * B - 0.5, k0 = Math.max(0, Math.min(B - 1, Math.floor(f))), k1 = Math.min(B - 1, k0 + 1), u = Math.max(0, Math.min(1, f - k0));
    const th = thin[k0] * (1 - u) + thin[k1] * u, as = Math.abs(s[v]);
    e[v] = Math.max(th * smooth(o.gateFrom, o.gateTo, as), smooth(o.tipFrom, o.tipTo, as), sheet);
  }
  return e;
}
/** The local thickness of a closed muscle mesh at the vertices where `want[v]` > 0 (pure; millimetres, the source units):
 * the depth to the nearest vertex of the opposite surface found along the inward normal (steps of stepMm up to
 * thickMm, a spatial hash of cellMm cells; an opposite vertex faces the other way and lies within one cell of the inward
 * line). Normals are the area-weighted triangle normals, turned outward by the sign of the mesh's volume. Returns a
 * Float32Array (thickMm where nothing was found or not asked), or null without triangles. */
export function tendonThickness(rest, indices, want, o = TENDON_FROM_STACK) {
  const n = Math.floor(rest.length / 3);
  if (!indices || indices.length < 3 || !(o.cellMm > 0) || !(o.stepMm > 0) || !(o.thickMm > 0)) return null;
  const out = new Float32Array(n).fill(o.thickMm);
  let asked = 0;
  for (let v = 0; v < n; v++) if (want[v] > 0) asked++;
  if (!asked) return out;
  const nor = new Float32Array(3 * n);
  let vol = 0;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = 3 * indices[t], b = 3 * indices[t + 1], c = 3 * indices[t + 2];
    if (a >= 3 * n || b >= 3 * n || c >= 3 * n) continue;
    const ux = rest[b] - rest[a], uy = rest[b + 1] - rest[a + 1], uz = rest[b + 2] - rest[a + 2];
    const vx = rest[c] - rest[a], vy = rest[c + 1] - rest[a + 1], vz = rest[c + 2] - rest[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    vol += rest[a] * nx + rest[a + 1] * ny + rest[a + 2] * nz;
    for (const k of [a, b, c]) { nor[k] += nx; nor[k + 1] += ny; nor[k + 2] += nz; }
  }
  const sgn = vol < 0 ? -1 : 1;
  for (let v = 0; v < n; v++) {
    const l = Math.hypot(nor[3 * v], nor[3 * v + 1], nor[3 * v + 2]);
    if (l > 0) { nor[3 * v] *= sgn / l; nor[3 * v + 1] *= sgn / l; nor[3 * v + 2] *= sgn / l; }
  }
  const inv = 1 / o.cellMm, key = (x, y, z) => (Math.floor(x * inv) + 4096) * 67108864 + (Math.floor(y * inv) + 4096) * 8192 + (Math.floor(z * inv) + 4096);
  const cells = new Map();
  for (let v = 0; v < n; v++) {
    const k = key(rest[3 * v], rest[3 * v + 1], rest[3 * v + 2]);
    const l = cells.get(k);
    if (l) l.push(v); else cells.set(k, [v]);
  }
  const lat2 = o.cellMm * o.cellMm;
  for (let v = 0; v < n; v++) {
    if (!(want[v] > 0)) continue;
    const px = rest[3 * v], py = rest[3 * v + 1], pz = rest[3 * v + 2], nx = nor[3 * v], ny = nor[3 * v + 1], nz = nor[3 * v + 2];
    if (nx === 0 && ny === 0 && nz === 0) continue;
    let best = o.thickMm, lastKey = NaN;
    for (let depth = o.stepMm; depth <= o.thickMm + 1e-9 && best > depth - o.cellMm; depth += o.stepMm) {
      const k = key(px - nx * depth, py - ny * depth, pz - nz * depth);
      if (k === lastKey) continue;
      lastKey = k;
      const l = cells.get(k);
      if (!l) continue;
      for (const u of l) {
        if (u === v || nor[3 * u] * nx + nor[3 * u + 1] * ny + nor[3 * u + 2] * nz > -0.2) continue;
        const dx = rest[3 * u] - px, dy = rest[3 * u + 1] - py, dz = rest[3 * u + 2] - pz;
        const dd = -(dx * nx + dy * ny + dz * nz);
        if (!(dd > 0.3) || dx * dx + dy * dy + dz * dz - dd * dd > lat2) continue;
        if (dd < best) best = dd;
      }
    }
    out[v] = best;
  }
  return out;
}

export function tendonFromStack(rest, full, out = null, o = TENDON_FROM_STACK, indices = null) {
  const n = Math.floor(Math.min(rest.length, full.length) / 3);
  const w = out && out.length === n ? out : new Float32Array(n);
  const d = new Float32Array(n);
  for (let v = 0, i = 0; v < n; v++, i += 3) d[v] = Math.hypot(full[i] - rest[i], full[i + 1] - rest[i + 1], full[i + 2] - rest[i + 2]);
  const sorted = Float32Array.from(d).sort();
  const ref = n ? sorted[Math.min(n - 1, Math.floor(o.percentile * n))] : 0;
  const h = o.share * ref;
  if (!(h > 1e-6) || !Number.isFinite(h)) { w.fill(0); return w; }
  let any = 0;
  for (let v = 0; v < n; v++) { const t = Math.min(1, d[v] / h); w[v] = 1 - t * t * (3 - 2 * t); if (w[v] > 0) any++; }
  if (!any) return w;
  // Endness: only where the muscle narrows into its tendon or ends (see above). Degenerate mesh: the anchored weight.
  const end = Number.isFinite(o.bins) ? tendonEndness(rest, o) : null;
  if (end) for (let v = 0; v < n; v++) w[v] *= end[v];
  // Thin only (see above): a thick belly is never tendon-white, however it is anchored.
  if (indices && Number.isFinite(o.thinMm) && o.thickMm > o.thinMm) {
    for (let v = 0; v < n; v++) if (w[v] < 0.01) w[v] = 0; // below any visible tint: not worth a thickness probe
    const th = tendonThickness(rest, indices, w, o);
    if (th) for (let v = 0; v < n; v++) if (w[v] > 0) { const t = Math.min(1, Math.max(0, (th[v] - o.thinMm) / (o.thickMm - o.thinMm))); w[v] *= 1 - t * t * (3 - 2 * t); }
  }
  // Smoothed over the surface (each pass: every vertex takes the mean of itself and its triangle neighbours), so the
  // tendon white fades softly instead of following single triangle edges as white scratches.
  if (indices && indices.length >= 3 && o.smoothPasses > 0) {
    const sum = new Float32Array(n), cnt = new Float32Array(n);
    for (let pass = 0; pass < o.smoothPasses; pass++) {
      sum.set(w); cnt.fill(1);
      for (let t = 0; t + 2 < indices.length; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        if (a >= n || b >= n || c >= n) continue;
        sum[a] += w[b] + w[c]; sum[b] += w[a] + w[c]; sum[c] += w[a] + w[b]; cnt[a] += 2; cnt[b] += 2; cnt[c] += 2;
      }
      for (let v = 0; v < n; v++) w[v] = sum[v] / cnt[v];
    }
  }
  return w;
}

/** R5-scene (D19): "behind the glass". Where the brain's drawn outline covers the mirror body (the ellipse of the
 * brain's projected bounds, like BODY_OVER_BRAIN), the mirror body is drawn dimmer and a little glass-blue (dim, tint),
 * so it reads as standing BEHIND the glass brain and the brain areas in front of it stay readable; dragged clear of the
 * brain it is drawn at full strength. Display choices. */
// R5-bigbrain (R26): dim 0.6 -> 0.75 with the more see-through glass (the mirror body reads more clearly through it:
// its pixel signal at 1280x720 62.8 -> 72.1, round5/R5-bigbrain-NOTES.md); still dimmer and bluer than in the open.
export const BEHIND_GLASS = Object.freeze({ dim: 0.75, tint: Object.freeze([0.86, 0.93, 1.0]), edge: 0.1 });
/** Fragment patch (pure): outgoingLight *= mix(1, tint x dim, amount x inside(ellipse nsBgWin) x behind). Hook: before
 * '#include <opaque_fragment>' (r154+) or '#include <output_fragment>'. null when missing.
 * R558: behind = 1 only for a fragment farther from the camera than the brain's nearest point (nsBg.z, metres; 0 = no
 * depth gate). The literal reflection stands in FRONT of the brain at the start: no glass is in front of it there, so
 * it must not be dimmed as if it were behind the glass (only glass that really is in front tints it). */
export function patchBehindGlassShaders(vertexShader, fragmentShader, o = BEHIND_GLASS) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  const hook = GLASS_FRAGMENT_HOOKS.find(h => fragmentShader.includes(h));
  if (!hook || !fragmentShader.includes('outgoingLight') || !fragmentShader.includes('vViewPosition')) return null;
  const f = fragmentShader.indexOf(hook);
  const t = o.tint;
  const body = `
	if ( nsBg.x > 0.0 ) {
		vec2 nsBd = ( gl_FragCoord.xy - nsBgWin.xy ) / max( nsBgWin.zw, vec2( 1.0 ) );
		float nsBin = ( 1.0 - smoothstep( ${glslFloat(1 - o.edge)}, 1.0, length( nsBd ) ) ) * ( nsBg.z > 0.0 ? step( nsBg.z, length( vViewPosition ) ) : 1.0 );
		outgoingLight *= mix( vec3( 1.0 ), vec3( ${glslFloat(t[0])}, ${glslFloat(t[1])}, ${glslFloat(t[2])} ) * nsBg.y, nsBg.x * nsBin );
	}
`;
  return { vertexShader, fragmentShader: 'uniform vec4 nsBg;\nuniform vec4 nsBgWin;\n' + fragmentShader.slice(0, f) + body + fragmentShader.slice(f) };
}

/** Plain hover caption of a 3D arrow (pure): ns-text ARROWS when R5-text provides it ({ brain: { tip }, mirror: { tip } }
 * or { tip, mirrorTip }), else the round-4 ORBIT captions for the brain and ARROW_TIP_FALLBACK for the mirror body.
 * (The fallback wording should move to ns-text; listed in round5/R5-scene-NOTES.md.) */
export const ARROW_TIP_FALLBACK = Object.freeze({
  forward: 'Tilt the mirror body: see it from above', back: 'Tilt the mirror body: see it from below',
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
  onOrbit = null, overlayRoot = null, faceView = 'off', quality = 'auto', brainDistanceScale = 1, antialias = 'auto'
} = {}) {
  requireThree(THREE);
  if (!canvas || typeof canvas.addEventListener !== 'function' || !canvas.ownerDocument) {
    fail('scene_args', 'canvas must be a canvas element that belongs to a document');
  }
  if (!GLASS_XRAY_MODES.includes(glassXrayMode)) fail('scene_args', `glassXray must be one of ${GLASS_XRAY_MODES.join(', ')}`);
  if (onOrbit !== null && typeof onOrbit !== 'function') fail('scene_args', 'onOrbit must be a function');
  if (!FACE_VIEW_MODES.includes(faceView) && !RETIRED_FACE_VIEW_MODES.includes(faceView)) fail('scene_args', `faceView must be one of ${FACE_VIEW_MODES.join(', ')}`);
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
  let brainRestElements = null; // R558: the brain's matrix with the orbit taken out (setBrainTransform), or null
  let lastRenderAt = null;
  let lastSampleAt = null; // R4-fix (code review F1): the quality controller's own interval clock (live frames only)
  let lastRenderCpuMs = NaN, lastBusyMs = NaN;

  const msaa = antialiasFor({ antialias, quality: startMode, rendererName });
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: msaa, powerPreference: 'high-performance' });
  // Front-to-back glass depth pre-pass (guarded: setTransparentSort is a core WebGLRenderer method since r142).
  const transparentSortApplied = typeof renderer.setTransparentSort === 'function';
  if (transparentSortApplied) renderer.setTransparentSort(transparentSortNs);
  const scene = new THREE.Scene();
  { // R558 (Message 22; Message 24 put space black back: MATERIAL.backgroundGradient null): a gradient texture if one is set, else the flat colour
    const bg = clinicalBackground(THREE, canvas && canvas.ownerDocument);
    scene.background = bg ? keep(bg) : new THREE.Color(MATERIAL.background);
  }
  const camera = new THREE.PerspectiveCamera(fovYDeg, 1, near, far);
  camera.rotation.set(0, 0, 0, 'YXZ');
  scene.add(camera); // the camera must be in the scene graph for its children (the arm) to render
  // R558 (Message 20, ns-outline): body meshes register below (setArm, setBody); the composite draws first of the
  // transparent list, so glass, areas, glow and arrows are blended over the lines as over the bodies.
  const outline = createOutlinePass({ THREE, renderer });
  scene.add(outline.composite);
  // R558 BB: the motor strip's ink silhouette, after the areas and before the glass (RENDER_ORDER.regionLine + 0.05).
  outline.stripComposite.renderOrder = RENDER_ORDER.regionLine + 0.05;
  scene.add(outline.stripComposite);
  disposables.push({ dispose: () => outline.dispose() });
  // R558 (Message 25): the HDR picture and its bloom (HDR_BLOOM); off on a software renderer. Its target is always
  // multisampled (a game started at Picture quality Low has a canvas without MSAA; switched to High it still gets
  // smooth edges through this target).
  const hdr = createHdrBloom({ THREE, renderer, msaa: true, enabled: !softwareRenderer });
  const hdrSize = new THREE.Vector2();
  const mainPassInfo = { calls: null, triangles: null }; // renderer.info of the main pass (the bloom passes come after it)
  disposables.push({ dispose: () => hdr.dispose() });

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
  const keyLight = new THREE.DirectionalLight(LIGHT.keyColor, LIGHT.key);
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
    if (OWN_BODY_SOLID) return m; // R558: the arm is never see-through
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
  const boneTips = { meshes: 0 }; // R558 (Message 30): phalanges drawn from their rounded display copy (boneTipDisplay)
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
  const boneMaterial = ghostPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: MATERIAL.boneRoughness, metalness: 0 })));
  // Strip shader state: applied is null until the strip program compiles, then whether every hook was found.
  const stripShader = { applied: null, shimmer: shimmer === 'auto' ? !reducedMotion : Boolean(shimmer), reducedMotion };
  // Glass (RENDER_ORDER 4..6). Unlit MeshBasicMaterial passes with the glassAlpha rim patch; `glassRim.applied` is
  // null until Three compiles a glass program, then whether every hook was found (Root's browser check).
  const glassRim = { applied: null, shell: null, xray: null };
  // R3-scene: the shell pass reads gyri and sulci (patchGlassReadShaders: crown light + groove cue from the nsSulc attribute).
  const glassReadUniform = { value: new Float32Array([GLASS_READ.crownOpacity, GLASS_READ.crownBright, GLASS_READ.grooveLight, GLASS_READ.grooveAlpha]) };
  const glassRead = { applied: null, sulcMs: null, supportPoints: 0 };
  const glassClearUniform = { value: GLASS_CLEAR.clear }; // R558: glass clears next to the motor strip (GLASS_CLEAR)
  // R558 BB: the glass ink uniforms (ns-brain-ink BRAIN_INK.glass; nsGInk.w = the pixel ratio, set in applyBuffer).
  const glassInkUniforms = (() => {
    const v = glassInkUniformValues();
    return { nsGInk: { value: new THREE.Vector4(...v.nsGInk) }, nsGInk2: { value: new THREE.Vector4(...v.nsGInk2) }, nsGHi: { value: new THREE.Vector4(...v.nsGHi) },
      nsGHi2: { value: new THREE.Vector4(...v.nsGHi2) }, nsGCel: { value: new THREE.Vector4(...v.nsGCel) }, nsGCel2: { value: new THREE.Vector4(...v.nsGCel2) },
      nsInkG: { value: new THREE.Vector3(...v.nsInkG) } };
  })();
  // R558 BB2 (target 2, "the glass brain shows its own gyri and sulci"): the glass fold depth (ns-brain-ink foldDepth
  // over every atlas brain vertex, BRAIN_INK.glassFold) replaces the coarse hull depth in each glass geometry's groove
  // attribute nsSulc. About 0.5 s of work for the 178,743 glass vertices, so it runs in slices of at most sliceMs on
  // timer turns while the rest of the anatomy loads; until it is done the glass shows the hull grooves and no inked
  // sulci (nsGInk2.z = 0). state: 'none' | 'running' | 'done' | 'failed'.
  const glassFold = { state: 'none', vertices: 0, meshes: 0, slices: 0, workMs: 0, gridMs: 0, coverMs: null, covered: 0, wallMs: null, error: null, token: 0 };
  let stripCoverInput = null; // R558 BB2: the strip's vertices and envelope normals (regionBorderSetup), for the glass over the strip
  function startGlassFold(sourceList) {
    const token = ++glassFold.token, F = BRAIN_INK.glassFold;
    glassInkUniforms.nsGInk2.value.z = 0;
    const jobs = [];
    for (const m of glass) {
      const geo = m && m.geometry, P = geo && geo.attributes.position, Nn = geo && geo.attributes.normal, A = geo && geo.attributes.nsSulc;
      if (!P || !Nn || !A || P.count !== A.count) continue;
      jobs.push({ positions: P.array, normals: Nn.array, attr: A, near: geo.attributes.nsNear || null, out: null, at: geo.userData.nsGlassAt });
    }
    let total = 0;
    for (const g of sourceList || []) if (g && g.positions && g.positions.length >= 9) total += g.positions.length;
    if (!jobs.length || !total) { glassFold.state = 'none'; return; }
    let cloud = new Float32Array(total);
    { let o = 0; for (const g of sourceList) if (g && g.positions && g.positions.length >= 9) { cloud.set(g.positions, o); o += g.positions.length; } }
    Object.assign(glassFold, { state: 'running', vertices: 0, meshes: jobs.length, slices: 0, workMs: 0, gridMs: 0, coverMs: null, covered: 0, wallMs: null, error: null });
    const coverIn = stripCoverInput;
    const t00 = nowMs();
    let grid = null, ji = 0, v = 0;
    const later = typeof globalThis.setTimeout === 'function' ? fn => globalThis.setTimeout(fn, 0) : null;
    const step = () => {
      if (token !== glassFold.token) return; // a newer brain took over
      const t0 = nowMs();
      try {
        if (!grid) {
          grid = foldGrid(cloud, F.cellMm); cloud = null; glassFold.gridMs = Math.round(nowMs() - t0);
          // GLASS_CLEAR (BB2): the glass that lies OVER the strip (ns-brain-ink stripCover: within a few mm of the line from a
          // strip vertex out along the envelope normal) clears like the glass next to it, so the buried banks of the strip
          // (the anterior bank under the frontal gyri) are seen without a veil; the gyri beside the strip keep their glass.
          if (coverIn) {
            const tc = nowMs(), withNear = jobs.filter(J => J.near && J.near.count === J.positions.length / 3);
            const cov = stripCover(withNear.map(J => J.positions), coverIn.positions, coverIn.env);
            withNear.forEach((J, i) => {
              const a = J.near.array, c = cov[i];
              for (let k = 0; k < c.length; k++) if (c[k] > a[k]) { a[k] = c[k]; glassFold.covered++; }
              J.near.needsUpdate = true;
            });
            glassAllTouch('nsNear');
            glassFold.coverMs = Math.round(nowMs() - tc);
          }
        }
        while (ji < jobs.length && (!later || nowMs() - t0 < F.sliceMs)) {
          const J = jobs[ji], n = J.positions.length / 3;
          if (!J.out) J.out = new Float32Array(n);
          const e = Math.min(n, v + 1024);
          foldDepth(J.positions, J.normals, grid, { radiusMm: F.radiusMm, ballMm: F.ballMm, maxMm: F.maxMm, start: v, end: e, out: J.out });
          glassFold.vertices += e - v;
          v = e;
          if (v >= n) {
            const shade = foldShade(J.out, { loMm: F.loMm, hiMm: F.hiMm });
            J.attr.array.set(shade); J.attr.needsUpdate = true;
            glassAllTouch('nsSulc', J.at, n);
            J.out = null; ji++; v = 0;
          }
        }
      } catch (err) {
        glassFold.state = 'failed'; glassFold.error = String((err && err.message) || err); grid = null; return;
      }
      glassFold.slices++; glassFold.workMs += nowMs() - t0;
      if (ji < jobs.length) { later(step); return; }
      glassFold.state = 'done'; glassFold.wallMs = Math.round(nowMs() - t00); glassFold.workMs = Math.round(glassFold.workMs);
      grid = null;
      glassInkUniforms.nsGInk2.value.z = 1;
    };
    if (later) later(step); else step();
  }
  // R4-integrator (D5 glass fix): shared uniforms of every glass rim material; set in render() from the brain transform.
  const farEyeRigidN = { value: new THREE.Matrix3() }, farEyeVec = { value: new THREE.Vector4(0, 0, 0, 0) };
  // R558: axis / axis0 = the squash axis as drawn / before the carry (world unit vectors) when the far-eye picture is
  // laid parallel to the screen (ns-brain pictureAxis 'view'); null = the round-4 rule (along the line of sight).
  const farEyeView = { rot: null, pw: null, K: 1, axis: null, axis0: null };
  // R4-scene: the shell's rim uniforms are kept, so the held-brain cue (HELD_CUE) can change them per frame.
  const shellRimUniforms = { nsRimOpacity: { value: MATERIAL.glassRimOpacity }, nsRimPower: { value: MATERIAL.glassRimPower }, nsRimGroove: { value: GLASS_READ.rimGroove } };
  const heldCue = { target: 0, amount: 0 };
  // R4-scene: the left-arm rim (LEFT_ARM_RIM) uniforms and state ({ applied: null until a left-arm region compiles }).
  const leftArmRimUniforms = { color: { value: new THREE.Color(REGION_RENDER.territoryLine) }, params: { value: new THREE.Vector3(LEFT_ARM_RIM.mix, LEFT_ARM_RIM.alpha, LEFT_ARM_RIM.glow) } };
  const leftArmRim = { applied: null, ms: null, borderSegments: 0 };
  const rimMaterial = (key, params, rim, power, cacheKey, read = false) => {
    const m = keep(new THREE.MeshBasicMaterial(params));
    m.forceSinglePass = true; // r150+: DoubleSide transparent in one pass
    m.onBeforeCompile = shader => {
      const patched = read ? patchGlassReadShaders(shader.vertexShader, shader.fragmentShader) : patchGlassShaders(shader.vertexShader, shader.fragmentShader);
      if (read) { glassRead.applied = patched !== null; if (patched) { shader.uniforms.nsRead = glassReadUniform; shader.uniforms.nsClear = glassClearUniform; shader.uniforms.nsRimGroove = shellRimUniforms.nsRimGroove; Object.assign(shader.uniforms, glassInkUniforms); } }
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
  // ---- R558 performance: tree-accelerated ray picks for RIGID meshes (ns-raybvh) -----------------------------------
  // "What is under the crosshair" is asked every live frame (graspTargetAt). Three.js tests every triangle of every
  // mesh the ray's line crosses; with the full meshes that was the largest single cost of an idle frame. A mesh given
  // to fastPick answers from a box tree over its own triangles instead: the same nearest hit, the same front / back
  // side rule, found without visiting the triangles that cannot be hit. Only rigid meshes use it (the brain, the body,
  // the mirror body, the arm bones); the CPU-skinned arm muscles keep Three's test, because their vertices move.
  // A tree is built once per geometry (rebuilt if its buffers are swapped), a few per frame ahead of need.
  // R558 (the Body Worlds stack): a lifted body muscle is rigid between changes of the lift amount, so it keeps its
  // tree. While its vertex buffer is being rewritten (the short ease of the lift) the tree's boxes are out of date, so
  // picks on that buffer use Three's own triangle test on the live vertices (pickStale); once the amount has stopped
  // changing for PICK_SETTLE_MS the trees over that buffer are rebuilt, a few per frame (pickStamp, stepPickTrees).
  // What is picked is what is drawn at every amount.
  const pickTrees = new WeakMap(), pickMeshes = [], pickStats = { trees: 0, buildMs: 0, pending: 0, rewritten: 0 };
  const pickStamp = new WeakMap(), pickStale = new Set(), PICK_SETTLE_MS = 150;
  let pickStaleAt = 0;
  /** A position array used by fastPick meshes was written in place (same array, new vertex values). */
  function pickBufferWritten(array) {
    pickStamp.set(array, (pickStamp.get(array) || 0) + 1);
    pickStale.add(array);
    pickStaleAt = nowMs();
    pickStats.rewritten++;
  }
  const pickInverse = new THREE.Matrix4(), pickRay = new THREE.Ray(), pickSphere = new THREE.Sphere(), pickPoint = new THREE.Vector3();
  function pickTreeOf(geometry) {
    const pos = geometry && geometry.attributes && geometry.attributes.position;
    if (!pos || !pos.array || pos.itemSize !== 3 || pos.isInterleavedBufferAttribute) return null;
    const index = geometry.index ? geometry.index.array : null, stamp = pickStamp.get(pos.array) || 0;
    let rec = pickTrees.get(geometry);
    if (!rec || rec.positions !== pos.array || rec.index !== index || rec.stamp !== stamp) {
      const t0 = nowMs();
      rec = { positions: pos.array, index, stamp, bvh: RayBvh.buildTriangleBvh(pos.array, index) };
      pickTrees.set(geometry, rec); pickStats.trees++; pickStats.buildMs += nowMs() - t0;
    }
    return rec;
  }
  // R558 (performance, P2): Three's own ray test, done in a typed loop, for meshes whose vertices move in place (the
  // CPU-skinned left-arm muscles and their mirror twins; a body buffer while it is being rewritten, pickStale). Three's
  // Mesh.raycast visits every triangle through Vector3 objects (fromBufferAttribute, subVectors, crossVectors), which was
  // the largest part of the per-frame crosshair pick in the Space dance. This keeps every step of it: the same bounding
  // sphere and box tests (Three's own methods, on the geometry's current, possibly stale, sphere and box), the same
  // triangle range, the same Moller-Trumbore arithmetic in the same order (Ray.intersectTriangle, the vertices swapped
  // for BackSide as Three does), the same local point (origin + direction * t), world point (Vector3.applyMatrix4) and
  // distance (Vector3.distanceTo), the same near / far rule. It reports only the NEAREST hit of the mesh (the first of
  // equal distances, as Three's stable sort would), with distance, point, object and faceIndex and face null, as
  // treeRaycast does: every caller reads only the nearest hit's object, distance and point (graspTargetAt,
  // mirrorPartAt; muscleAt asks Three itself for every hit of a mesh whose nearest hit is not drawn). Anything unusual
  // (no material, a material array, morph targets, interleaved or normalized positions) goes to Three's own test.
  // R558 (performance, P2): the box of a position buffer's CURRENT vertices (Math.min / Math.max over every vertex, as
  // Three's Box3.setFromBufferAttribute), kept per attribute while its array, count and version are unchanged (a
  // rewritten buffer bumps its version: needsUpdate). Shared by the arm muscles' bounding spheres (muscleAt) and the
  // live-box pre-test of rawRaycast; the per-vertex skinned buffers are rewritten at most once a frame.
  const liveBoxes = new WeakMap();
  function liveBoxOf(pos) {
    let b = liveBoxes.get(pos);
    const stamp = pickStamp.get(pos.array) || 0; // a buffer written in place for the picks (pickBufferWritten) counts too
    if (b && b.array === pos.array && b.count === pos.count && b.version === pos.version && b.stamp === stamp) return b;
    const A = pos.array, n3 = 3 * pos.count;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < n3; k += 3) {
      const x = A[k], y = A[k + 1], z = A[k + 2];
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
    }
    b = { array: pos.array, count: pos.count, version: pos.version, stamp, x0, y0, z0, x1, y1, z1 };
    liveBoxes.set(pos, b);
    return b;
  }
  const plainPositions = (geometry, pos) => Boolean(pos) && pos.array instanceof Float32Array && pos.itemSize === 3 && !pos.normalized && !pos.isInterleavedBufferAttribute
    && !pos.isGLBufferAttribute && !(geometry.morphAttributes && geometry.morphAttributes.position);
  /** geometry.computeBoundingSphere() with Three's exact arithmetic (Box3 of the vertices, its centre (min + max) * 0.5,
   * the largest centre.distanceToSquared(vertex), Math.sqrt), on typed arrays instead of Vector3 per vertex, and not redone
   * while the buffer and the sphere Three would have left are unchanged. Unusual geometries and a NaN radius (Three
   * logs it) go to Three's own method. */
  const sphereMemo = new WeakMap();
  function computeSphereExact(geometry) {
    const pos = geometry.attributes.position;
    if (!plainPositions(geometry, pos)) { geometry.computeBoundingSphere(); return; }
    const s0 = geometry.boundingSphere, m = sphereMemo.get(geometry), stamp = pickStamp.get(pos.array) || 0;
    if (s0 && m && m.sphere === s0 && m.array === pos.array && m.count === pos.count && m.version === pos.version && m.stamp === stamp
        && Object.is(s0.center.x, m.x) && Object.is(s0.center.y, m.y) && Object.is(s0.center.z, m.z) && Object.is(s0.radius, m.r)) return;
    const b = liveBoxOf(pos), A = pos.array, n3 = 3 * pos.count;
    const empty = b.x1 < b.x0 || b.y1 < b.y0 || b.z1 < b.z0;
    const cx = empty ? 0 : (b.x0 + b.x1) * 0.5, cy = empty ? 0 : (b.y0 + b.y1) * 0.5, cz = empty ? 0 : (b.z0 + b.z1) * 0.5;
    let maxRadiusSq = 0;
    for (let k = 0; k < n3; k += 3) {
      const dx = cx - A[k], dy = cy - A[k + 1], dz = cz - A[k + 2];
      maxRadiusSq = Math.max(maxRadiusSq, dx * dx + dy * dy + dz * dz);
    }
    const r = Math.sqrt(maxRadiusSq);
    if (Number.isNaN(r)) { geometry.computeBoundingSphere(); return; }
    if (geometry.boundingSphere === null) geometry.boundingSphere = new THREE.Sphere();
    const s = geometry.boundingSphere;
    s.center.set(cx, cy, cz); s.radius = r;
    sphereMemo.set(geometry, { sphere: s, array: pos.array, count: pos.count, version: pos.version, stamp, x: cx, y: cy, z: cz, r });
  }
  const rawLiveBox = new THREE.Box3();
  const rawSphere = new THREE.Sphere(), rawRay = new THREE.Ray(), rawInverse = new THREE.Matrix4(), rawSphereHit = new THREE.Vector3();
  const rawWorld = new THREE.Vector3(), rawBestPoint = new THREE.Vector3();
  function rawRaycast(raycasterIn, intersects) {
    const geometry = this.geometry, material = this.material, matrixWorld = this.matrixWorld;
    const pos = geometry && geometry.attributes ? geometry.attributes.position : undefined;
    if (material === undefined || Array.isArray(material) || !pos || pos.isInterleavedBufferAttribute || pos.normalized || pos.itemSize !== 3
        || (geometry.morphAttributes && geometry.morphAttributes.position && this.morphTargetInfluences)) return THREE.Mesh.prototype.raycast.call(this, raycasterIn, intersects);
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    rawSphere.copy(geometry.boundingSphere);
    rawSphere.applyMatrix4(matrixWorld);
    rawRay.copy(raycasterIn.ray).recast(raycasterIn.near);
    if (rawSphere.containsPoint(rawRay.origin) === false) {
      if (rawRay.intersectSphere(rawSphere, rawSphereHit) === null) return undefined;
      if (rawRay.origin.distanceToSquared(rawSphereHit) > (raycasterIn.far - raycasterIn.near) ** 2) return undefined;
    }
    rawInverse.copy(matrixWorld).invert();
    rawRay.copy(raycasterIn.ray).applyMatrix4(rawInverse);
    if (geometry.boundingBox !== null && rawRay.intersectsBox(geometry.boundingBox) === false) return undefined;
    // R558 (P2): every triangle lies inside the box of the current vertices; a ray that misses that box (widened by a
    // margin far above rounding) meets no triangle, so the loop below would find nothing.
    if (pos.array instanceof Float32Array) {
      const lb = liveBoxOf(pos);
      if (!(lb.x1 < lb.x0 || lb.y1 < lb.y0 || lb.z1 < lb.z0)) {
        const pad = 1e-6 * Math.max(lb.x1 - lb.x0, lb.y1 - lb.y0, lb.z1 - lb.z0, Math.abs(lb.x0), Math.abs(lb.x1), Math.abs(lb.y0), Math.abs(lb.y1), Math.abs(lb.z0), Math.abs(lb.z1)) + 1e-12;
        rawLiveBox.min.set(lb.x0 - pad, lb.y0 - pad, lb.z0 - pad); rawLiveBox.max.set(lb.x1 + pad, lb.y1 + pad, lb.z1 + pad);
        if (Number.isFinite(pad) && rawRay.intersectsBox(rawLiveBox) === false) return undefined;
      }
    }
    const P = pos.array, index = geometry.index, I = index ? index.array : null, drawRange = geometry.drawRange;
    const start = Math.max(0, drawRange.start), end = Math.min(index ? index.count : pos.count, drawRange.start + drawRange.count);
    const back = material.side === THREE.BackSide, cull = back || material.side === THREE.FrontSide;
    const ox = rawRay.origin.x, oy = rawRay.origin.y, oz = rawRay.origin.z, dx = rawRay.direction.x, dy = rawRay.direction.y, dz = rawRay.direction.z;
    const rayOriginW = raycasterIn.ray.origin, near = raycasterIn.near, far = raycasterIn.far;
    let best = Infinity, bestFace = -1;
    for (let i = start; i < end; i += 3) {
      // Three: checkIntersection(pA, pB, pC), or (pC, pB, pA) for BackSide, with backface culling for Front and Back.
      let ia, ib = 3 * (I ? I[i + 1] : i + 1), ic;
      if (back) { ia = 3 * (I ? I[i + 2] : i + 2); ic = 3 * (I ? I[i] : i); } else { ia = 3 * (I ? I[i] : i); ic = 3 * (I ? I[i + 2] : i + 2); }
      const ax = P[ia], ay = P[ia + 1], az = P[ia + 2];
      const e1x = P[ib] - ax, e1y = P[ib + 1] - ay, e1z = P[ib + 2] - az;
      const e2x = P[ic] - ax, e2y = P[ic + 1] - ay, e2z = P[ic + 2] - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      let DdN = dx * nx + dy * ny + dz * nz, sign;
      if (DdN > 0) { if (cull) continue; sign = 1; } else if (DdN < 0) { sign = -1; DdN = -DdN; } else continue;
      const qx = ox - ax, qy = oy - ay, qz = oz - az;
      const DdQxE2 = sign * (dx * (qy * e2z - qz * e2y) + dy * (qz * e2x - qx * e2z) + dz * (qx * e2y - qy * e2x));
      if (DdQxE2 < 0) continue;
      const DdE1xQ = sign * (dx * (e1y * qz - e1z * qy) + dy * (e1z * qx - e1x * qz) + dz * (e1x * qy - e1y * qx));
      if (DdE1xQ < 0) continue;
      if (DdQxE2 + DdE1xQ > DdN) continue;
      const QdN = -sign * (qx * nx + qy * ny + qz * nz);
      if (QdN < 0) continue;
      const t = QdN / DdN;
      rawWorld.set(ox, oy, oz);
      rawWorld.x += dx * t; rawWorld.y += dy * t; rawWorld.z += dz * t; // Ray.at: origin + direction * t (addScaledVector)
      rawWorld.applyMatrix4(matrixWorld);
      const distance = rayOriginW.distanceTo(rawWorld);
      if (distance < near || distance > far) continue;
      if (distance < best) { best = distance; bestFace = Math.floor(i / 3); rawBestPoint.copy(rawWorld); }
    }
    if (bestFace >= 0) intersects.push({ distance: best, point: rawBestPoint.clone(), object: this, faceIndex: bestFace, face: null });
    return undefined;
  }
  function treeRaycast(raycasterIn, intersects) {
    const geometry = this.geometry, material = this.material;
    if (pickStale.size > 0) {
      const live = geometry && geometry.attributes && geometry.attributes.position;
      if (live && pickStale.has(live.array)) return rawRaycast.call(this, raycasterIn, intersects);
    }
    const rec = material && !Array.isArray(material) ? pickTreeOf(geometry) : null;
    if (!rec) return THREE.Mesh.prototype.raycast.call(this, raycasterIn, intersects);
    if (!rec.bvh) return undefined;
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    pickSphere.copy(geometry.boundingSphere).applyMatrix4(this.matrixWorld);
    if (raycasterIn.ray.intersectsSphere(pickSphere) === false) return undefined;
    pickInverse.copy(this.matrixWorld).invert();
    pickRay.copy(raycasterIn.ray).applyMatrix4(pickInverse);
    const o = pickRay.origin, d = pickRay.direction;
    const side = material.side === THREE.BackSide ? RayBvh.BVH_SIDE.back : material.side === THREE.DoubleSide ? RayBvh.BVH_SIDE.double : RayBvh.BVH_SIDE.front;
    const hit = RayBvh.raycastTriangleBvh(rec.bvh, rec.positions, rec.index, o.x, o.y, o.z, d.x, d.y, d.z, side);
    if (!hit) return undefined;
    pickPoint.set(o.x + d.x * hit.t, o.y + d.y * hit.t, o.z + d.z * hit.t).applyMatrix4(this.matrixWorld);
    const distance = raycasterIn.ray.origin.distanceTo(pickPoint);
    if (distance < raycasterIn.near || distance > raycasterIn.far) return undefined;
    intersects.push({ distance, point: pickPoint.clone(), object: this, faceIndex: hit.triangle, face: null });
    return undefined;
  }
  const fastPick = mesh => { if (mesh && mesh.raycast !== treeRaycast) { mesh.raycast = treeRaycast; pickMeshes.push(mesh); } return mesh; };
  /** Build a few missing pick trees per frame, largest work first in arrival order, within budgetMs (one tree at least). */
  let pickCursor = 0;
  function stepPickTrees(budgetMs = 3) {
    // R558: buffers rewritten by the lift have settled: walk every mesh again (only the rewritten ones rebuild).
    if (pickStale.size > 0 && nowMs() - pickStaleAt >= PICK_SETTLE_MS) { pickStale.clear(); pickCursor = 0; }
    if (pickCursor >= pickMeshes.length) { pickStats.pending = 0; return 0; }
    const t0 = nowMs();
    let built = 0;
    while (pickCursor < pickMeshes.length) {
      const m = pickMeshes[pickCursor++], g = m && m.geometry, before = pickStats.trees;
      if (g) pickTreeOf(g);
      if (pickStats.trees !== before) { built++; if (nowMs() - t0 >= budgetMs) break; }
    }
    pickStats.pending = pickMeshes.length - pickCursor;
    return built;
  }
  const rayOrigin = new THREE.Vector3(0, 0, 0);
  const rayDir = new THREE.Vector3(0, 0, -1);
  const scratch = new THREE.Vector3();

  const bones = [];
  const muscles = [];
  const glass = [];
  const glassDepth = [];
  const glassXray = [];
  // R558 (performance): the glass is DRAWN by three meshes over one merged geometry (shell, depth pre-pass, x-ray
  // subset) instead of one mesh per piece and pass (57 + 57 + 31 draws at the start). Same vertices, same triangle
  // order as the pieces' creation order (which was their draw order: equal depth key, then object id), same three
  // materials, so the picture is the same. The per-piece meshes above stay for picking, collision, the coarser copies
  // and the counts, on GLASS_PIECE_LAYER: the camera does not draw that layer, the raycaster tests it.
  const GLASS_PIECE_LAYER = 1;
  const glassAll = { shell: null, depth: null, xray: null, full: null, lod: new Map() };
  /** One merged geometry of the glass pieces' CURRENT geometries (and one of the x-ray subset over the same vertex
   * buffers). `sulcAll` / `nearAll`: the full pieces' shared arrays (their attributes are views into these), else
   * the values are copied. */
  function glassAllBuild(sulcAll = null, nearAll = null) {
    let nv = 0, ni = 0, nx = 0;
    for (const m of glass) { const g = m.geometry; nv += g.attributes.position.count; ni += g.index.count; if (m.userData.nsXray) nx += g.index.count; }
    const wantNear = glass.every(m => m.geometry.attributes.nsNear);
    const P = new Float32Array(3 * nv), N = new Float32Array(3 * nv), S = sulcAll || new Float32Array(nv);
    const E = wantNear ? nearAll || new Float32Array(nv) : null, I = new Uint32Array(ni), X = new Uint32Array(nx);
    let vo = 0, io = 0, xo = 0;
    for (const m of glass) {
      const g = m.geometry, a = g.attributes, idx = g.index.array, n = a.position.count;
      P.set(a.position.array, 3 * vo);
      if (a.normal) N.set(a.normal.array, 3 * vo);
      if (!sulcAll && a.nsSulc) S.set(a.nsSulc.array, vo);
      if (E && !nearAll) E.set(a.nsNear.array, vo);
      for (let k = 0; k < idx.length; k++) I[io + k] = idx[k] + vo;
      if (m.userData.nsXray) { for (let k = 0; k < idx.length; k++) X[xo + k] = idx[k] + vo; xo += idx.length; }
      io += idx.length; vo += n;
    }
    const attrs = { position: new THREE.BufferAttribute(P, 3), normal: new THREE.BufferAttribute(N, 3), nsSulc: new THREE.BufferAttribute(S, 1) };
    if (E) attrs.nsNear = new THREE.BufferAttribute(E, 1);
    const make = index => {
      const g = keep(new THREE.BufferGeometry());
      for (const name of Object.keys(attrs)) g.setAttribute(name, attrs[name]);
      g.setIndex(new THREE.BufferAttribute(index, 1));
      return g;
    };
    const all = make(I), xray = nx ? make(X) : null;
    if (typeof all.computeBoundingSphere === 'function') { all.computeBoundingSphere(); if (xray && all.boundingSphere) xray.boundingSphere = all.boundingSphere.clone(); }
    return { all, xray, attrs };
  }
  /** The merged glass follows the pieces' level of detail (setLod): cell 0 = the full geometry. */
  function glassAllLod(cell) {
    if (!glassAll.shell) return;
    let G = glassAll.full;
    if (cell) { G = glassAll.lod.get(cell); if (!G) { G = glassAllBuild(); glassAll.lod.set(cell, G); } }
    glassAll.shell.geometry = G.all; glassAll.depth.geometry = G.all;
    if (glassAll.xray && G.xray) glassAll.xray.geometry = G.xray;
  }
  /** A write into a full piece's nsSulc / nsNear view (the background fold): the merged buffer goes to the GPU again
   * (only vertices at .. at + n when given). */
  function glassAllTouch(name, at = null, n = 0) {
    const a = glassAll.full && glassAll.full.attrs[name];
    if (!a) return;
    if (Number.isInteger(at) && n > 0 && typeof a.addUpdateRange === 'function') a.addUpdateRange(at, n);
    a.needsUpdate = true;
  }
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
  // R558 (Message 18, REGION_BORDER): per-fragment areas. applied: null until an area program compiles, then whether
  // every hook was found (false: the neighbours' fill meshes are hidden and the areas draw whole triangles as before).
  const regionBorder = { applied: null, rows: 0, fillMeshes: 0, fillTriangles: 0, ms: null, reason: null };
  const borderShared = {
    nsOwnTex: { value: null }, nsOwnInfo: { value: new THREE.Vector2(REGION_BORDER.texels, 0) },
    nsSeam: { value: new THREE.Vector4(REGION_BORDER.seamColor[0], REGION_BORDER.seamColor[1], REGION_BORDER.seamColor[2], REGION_BORDER.seamAlpha) },
    nsLineW: { value: new THREE.Vector4(REGION_BORDER.seamPx, REGION_BORDER.territoryPx, 0, 1) },
    nsBorderAA: { value: new THREE.Vector4(REGION_BORDER.aaPx, REGION_BORDER.hintSoftPx, REGION_BORDER.highlightGlow, REGION_BORDER.cavity) }
  };
  const borderHoverColor = new THREE.Color(REGION_RENDER.hoverLine), borderMarkColor = new THREE.Color(REGION_RENDER.activatedLine);
  const borderLeftArmColor = new THREE.Color(REGION_RENDER.territoryLine);
  /** The owner rows (one per hemisphere x surface rule, the picker's own lists), their texture and the smooth strip
   * normals; null (with regionBorder.reason) when the segmentation does not expose its owner lists. */
  function regionBorderSetup(seg) {
    const own = seg && seg._owners, ownerAt = NsBrain.regionOwnerAt;
    if (!own || typeof ownerAt !== 'function' || typeof THREE.DataTexture !== 'function' || THREE.FloatType === undefined) {
      regionBorder.reason = 'no owner lists / regionOwnerAt / float texture: areas drawn by whole triangles';
      return null;
    }
    const t0 = nowMs();
    const gap = seg.options && Number.isFinite(seg.options.gapTolU) ? seg.options.gapTolU : undefined;
    const rows = [], rowOf = new Map();
    for (const h of ['right', 'left']) {
      const o = own[h];
      if (!o) continue;
      for (const key of ['all', 'medial']) {
        const list = o[key];
        if (!Array.isArray(list) || !list.length) continue;
        rowOf.set(`${h}|${key}`, rows.length);
        rows.push(ownerRuns(s => ownerAt(list, s, gap)));
      }
    }
    if (!rows.length) { regionBorder.reason = 'empty owner lists'; return null; }
    const index = new Map(seg.regions.map((r, i) => [r, i]));
    const idOf = r => (r === null || r === undefined ? -1 : index.has(r) ? index.get(r) : -1);
    const tex = keep(new THREE.DataTexture(ownerTextureData(rows, idOf, r => regionGroupKey(r)), REGION_BORDER.texels, 2 * rows.length, THREE.RGBAFormat, THREE.FloatType));
    tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    borderShared.nsOwnTex.value = tex;
    // The picker's rule (ns-brain classifyRegionGaze): the medial list for a medial-surface hit when the hemisphere has
    // a medial wall and a medial list, else the hemisphere's list.
    const rowFor = part => {
      const h = part.hemisphere, o = own[h];
      const medial = part.surface === 'medial' && o && o.medial && seg.hemispheres && seg.hemispheres[h] && seg.hemispheres[h].medial;
      return rowOf.get(`${h}|${medial ? 'medial' : 'all'}`);
    };
    const normals = new Map(), cavity = new Map(), relief = new Map();
    // R558 BB2 (Messages 24, 35, gyri and sulci): the strip's OWN relief from the atlas geometry (ns-brain-ink
    // reliefDepth: below a large ball rolled over the strip meshes alone, along the brain's envelope normal from the
    // hull support planes): 0 on the crown top, about 1.5 mm at the lip of each sulcus, deeper down the banks. The
    // relief share (reliefShare) is the cavity input; the depth itself (nsRelief) drives the banded light and the
    // inked sulcus lines (patchAreaInkShaders). It replaces BB's whole-brain fold depth on the strip, under which the
    // medial crown (lower than its neighbours in this atlas) read as deep.
    const tf = nowMs();
    const stripList = (seg.strips || []).filter(S => S && S.positions && S.indices);
    let stripCloud = null;
    if (stripList.length) {
      stripCloud = new Float32Array(stripList.reduce((a, S) => a + S.positions.length, 0));
      let o = 0; for (const S of stripList) { stripCloud.set(S.positions, o); o += S.positions.length; }
    }
    const stripGrid = stripCloud ? foldGrid(stripCloud, BRAIN_INK.relief.cellMm) : null;
    const stripEnv = stripCloud ? new Float32Array(stripCloud.length) : null;
    let envAt = 0;
    for (const S of stripList) {
      const N = smoothSurfaceNormals(S.positions, S.indices);
      normals.set(S.id, N);
      const env = brainSupport ? envelopeNormals(S.positions, brainSupport, { fallback: N }) : N;
      stripEnv.set(env, envAt); envAt += env.length;
      const hd = stripGrid ? reliefDepth(S.positions, env, stripGrid) : new Float32Array(S.positions.length / 3);
      relief.set(S.id, hd);
      cavity.set(S.id, reliefShare(hd));
    }
    areaInk.foldMethod = brainSupport ? 'strip relief (large ball over the strip alone, along the envelope normal)' : 'strip relief along its own normals (no hull)';
    areaInk.foldMs = Math.round(nowMs() - tf);
    areaInk.foldCloudPoints = stripCloud ? stripCloud.length / 3 : 0;
    stripCoverInput = stripCloud && brainSupport ? { positions: stripCloud, env: stripEnv } : null; // for the glass over the strip (startGlassFold)
    regionBorder.rows = rows.length;
    regionBorder.ms = Math.round(nowMs() - t0);
    return { rows, rowFor, normals, cavity, relief, idOf, index };
  }
  /** Per-region border uniforms and the patch (composePatch chain). */
  function regionBorderPatch(material, r, regionIndex) {
    const left = r.isLeftArm === true, B = REGION_BORDER;
    const terr = left ? [borderLeftArmColor.r, borderLeftArmColor.g, borderLeftArmColor.b, B.leftArmAlpha] : [...B.territoryColor, B.territoryAlpha];
    const u = {
      nsRegionId: { value: regionIndex }, nsTerr: { value: new THREE.Vector4(terr[0], terr[1], terr[2], terr[3]) }, nsTerrGlow: { value: left ? B.leftArmGlow : B.territoryGlow },
      nsHi: { value: new THREE.Vector4(0, 0, 0, 0) }, nsHint: { value: new THREE.Vector4(0, 0, 0, 0) }, nsHintColor: { value: new THREE.Vector3(0, 0, 0) }
    };
    material.userData.nsBorder = u;
    return composePatch(material, 'ns-region-border-r558', shader => {
      const p = patchRegionBorderShaders(shader.vertexShader, shader.fragmentShader);
      if (!p) {
        regionBorder.applied = false;
        for (const rec of regions) for (const m of rec.fillMeshes || []) m.visible = false;
        return;
      }
      if (regionBorder.applied === null) regionBorder.applied = true;
      shader.vertexShader = p.vertexShader; shader.fragmentShader = p.fragmentShader;
      Object.assign(shader.uniforms, borderShared, u);
    });
  }
  let regionMode = false;
  let segmentation = null;
  let hoveredRegionId = null;
  let gazeOnRegion = false;
  let brainTransformSet = false;
  let brainSamples = null; // Float32Array of source-mm sample points (projected bounds for the orbit arrows)
  let brainSupport = null; // R3-scene: supportPoints of every brain vertex (the silhouette hull basis)
  let brainDepthBounds = null; // R22 all glass+strip SOURCE positions, conservative AABB cached only on normal load
  let brainSolid = null, brainSolidMs = 0, brainSolidError = null; // R558 (Message 12): ns-collide solidGrid of the brain meshes (source mm)
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
  const bodyBoneMaterial = keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: MATERIAL.boneRoughness, metalness: 0 }));
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
    if (OWN_BODY_SOLID) return m; // R558: the trunk is never see-through
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
  const torsoBoneMaterial = torsoPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: MATERIAL.boneRoughness, metalness: 0 })));
  // R3-fix (M4): body over the brain's outline is drawn see-through (BODY_OVER_BRAIN). Composes with torsoPatch.
  const overBrainUniform = { value: new Float32Array([0, BODY_OVER_BRAIN.alpha, 0, 0]) };
  const overBrainWinUniform = { value: new Float32Array([0, 0, 1, 1]) };
  const overBrain = { amount: 0, applied: null, materials: 0 };
  // R558 (FIRST_PERSON_BODY): every own-body material that takes the over-brain window also takes the first-person
  // rule (the same set: trunk, neck, legs, right arm; the in-place head twins too, which are drawn only in the view from
  // behind, where the rule is off). nsFp: the eye point in view space and the amount; set each rendered frame.
  const firstPersonUniform = { value: new THREE.Vector4(0, 0, 0, 0) };
  const firstPersonAxisUniform = { value: new THREE.Vector4(0, 0, -1, 0) };
  const firstPersonRangeUniform = { value: new THREE.Vector4(FIRST_PERSON_BODY.planeHideM, FIRST_PERSON_BODY.planeFullM, 0, 0) };
  const firstPersonLegRangeUniform = { value: new THREE.Vector4(FIRST_PERSON_BODY.legsHideM, FIRST_PERSON_BODY.legsFullM, 0, 0) };
  const firstPersonBody = { applied: null, amount: 0, backM: 0, base: 0 };
  const overBrainPatch = (m, legs = false) => {
    if (OWN_BODY_SOLID) return m; // R558: no window over the brain and no first-person plane rule
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.transparent = true;
    m.onBeforeCompile = (shader, r) => {
      if (typeof prev === 'function') prev.call(m, shader, r);
      const patched = patchOverBrainShaders(shader.vertexShader, shader.fragmentShader);
      overBrain.applied = patched !== null && overBrain.applied !== false;
      if (patched !== null) {
        shader.fragmentShader = patched.fragmentShader;
        shader.uniforms.nsOvl = overBrainUniform;
        shader.uniforms.nsOvlWin = overBrainWinUniform;
      }
      const fp = patchFirstPersonShaders(shader.vertexShader, shader.fragmentShader);
      firstPersonBody.applied = fp !== null && firstPersonBody.applied !== false;
      if (fp !== null) {
        shader.fragmentShader = fp.fragmentShader;
        shader.uniforms.nsFp = firstPersonUniform;
        shader.uniforms.nsFpN = firstPersonAxisUniform;
        shader.uniforms.nsFpR = legs ? firstPersonLegRangeUniform : firstPersonRangeUniform;
      }
    };
    m.customProgramCacheKey = () => `${typeof prevKey === 'function' ? prevKey.call(m) : ''}|ns-over-brain-r3fix|ns-first-person-r558`;
    overBrain.materials++;
    return m;
  };
  overBrainPatch(torsoBoneMaterial);
  overBrainPatch(bodyBoneMaterial);
  // R558 (FIRST_PERSON_BODY): the leg bones take the legs' own plane, so they need their own material.
  const legBoneMaterial = overBrainPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: MATERIAL.boneRoughness, metalness: 0 })), true);
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
  const faceBoneMaterial = keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: MATERIAL.boneRoughness, metalness: 0, transparent: true, opacity: FACE_LAYER.boneOpacity, depthWrite: false }));
  const faceDepthMaterial = keep(new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: true, transparent: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  }));
  const faceTwins = [];
  const insetCamera = new THREE.PerspectiveCamera(FACE_LAYER.inset.fovDeg, 1, 0.01, 50);
  const insetPrevColor = new THREE.Color();
  let faceMode = 'off'; // R558 (R26): the floating own face is never drawn, whatever an old caller passes
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
  // ---- R5-scene (D16): compass arrows round the brain and round the mirror body (ns-arrows3d) ----------------------
  // The round-2..4 DOM orbit buttons are gone. Two ns-arrows3d rigs of four arrows each. R558 (user Message 7): every
  // arrow is a basic V tip, placed at the middle of a side of its target's frame (updateArrows): the motor strip's
  // horizontal 16:9 frame and the mirror body's vertical 9:16 frame, as they stand at rest in the reference view. The
  // scene draws them, highlights the hovered one (setArrowHover), answers ray picks (pickArrows: the hit list R5-input's
  // resolveArrowHit takes) and gives their screen boxes to the overlay. Presses and holds are R5-input's (ns-controls
  // stepArrowInput); nothing ever orbits by itself.
  let arrowRigError = null;
  const makeArrowRig = kind => {
    try {
      // R5-access B1: the colours at the call site (brain grey-white, mirror green, so the two sets read apart): the
      // light fill is ns-colors' arrow colour, the edge band its dark outline colour.
      // R558 (Message 7): the tips are drawn ON TOP of everything (no depth test, last in the transparent list): where a
      // tip lies over a motor area, over the glass or over the body, the tip is what is seen there and what a tap there
      // means (pickArrows). They are translucent, so what lies under them still shows through. (Message 19) Each is a lit
      // solid chevron; its rim light takes the set's rim colour.
      const c = typeof NsColors.arrowLook === 'function' ? NsColors.arrowLook(kind) : null;
      const look = { ...NsArrows.ARROW_LOOK, ...(c ? { fill: c.tip, edge: c.outlineColor, hover: c.hover, rim: c.rim } : {}), renderOrder: ARROW_RENDER_ORDER[kind] };
      const rig = NsArrows.createArrowRig(THREE, { kind, look });
      rig.group.visible = false;
      scene.add(rig.group);
      // e2e detection contract (round5/R5-e2e-NOTES.md): userData.nsOrbitArrow { dir, target, hover } on each arrow root.
      for (const d of ARROW_DIRS) { rig.arrows[d].mesh.userData.nsArrow = { target: kind, dir: d }; rig.arrows[d].root.userData.nsOrbitArrow = { dir: d, target: kind, hover: false }; }
      return rig;
    } catch (err) { arrowRigError = String((err && err.message) || err); return null; }
  };
  const arrowSets = {};
  // frameHidden / occluded / vis: R558 (hunt 2, FRAME_VIS): the whole set hidden (its target mostly hidden or off
  // screen) and the single tips your own body is in front of.
  for (const target of ['brain', 'mirror']) arrowSets[target] = { target, rig: makeArrowRig(target), plan: null, frames: null, key: '', shown: false, boxes: {}, clicks: {}, boxKey: '', frameHidden: false, occluded: new Set(), vis: null };
  let arrowHover = null; // { target, dir, blocked } (setArrowHover)
  /** R558 (performance; user Messages 42, 48 and 50): the item the player holds now ('brain' | 'mirror' | null; ns-app
   * says so on every frame, before the picture is drawn). A held item is at a new place on every frame, and every new
   * place used to plan BOTH arrow frames again (the fit, the pair moves and a sight test against your own body for each
   * place tried): about a fifth of the time of a carried frame. So while an item is held its own arrows are not drawn
   * (it is in the hand; its arrows turn or tilt it once it is let go) and no frame is planned again; the first frame
   * after it is let go plans both frames for the new place, as before. The other item's arrows stay where they were. */
  let arrowHeld = null;
  function setHeldItem(target) {
    const t = target === 'brain' || target === 'mirror' ? target : null;
    if (t === arrowHeld) return false;
    arrowHeld = t; overlayDirty = true;
    return true;
  }
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
    // R558 (Messages 55 and 56): the area's movements, each with its number key (1 to 9).
    info.movesHeading = el('div', 'ns-infopanel-moves-heading', p);
    info.moves = el('ol', 'ns-infopanel-moves', p);
    info.movesHeading.hidden = true; info.moves.hidden = true;
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
    // R558 (Message 48, the R key "read information"): a small key prompt in the card's top right corner says what R
    // does next ("R more", "R hide"; ns-app toggleInfoDetail sets the word), and a chip in the same corner of the view
    // says how to bring the information back while it is hidden (CSS shows it only then: data-ns-read="off").
    const hintText = NsText.INFO.keyHint || { read: '', more: '', off: '' };
    const keyCap = (into, word, wordCls) => { el('span', 'ns-keycap', into).textContent = 'R'; el('span', wordCls, into).textContent = word; };
    info.keyHint = el('div', 'ns-infopanel-keyhint', p);
    info.keyHint.setAttribute('aria-hidden', 'true');
    keyCap(info.keyHint, String(hintText.read || '').replace(/^R:\s*/, ''), 'ns-infopanel-keyhint-word');
    info.readChip = el('div', 'ns-read-chip', overlay);
    keyCap(info.readChip, String(hintText.off || '').replace(/^R:\s*/, ''), 'ns-read-chip-word');
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
  // ---- R558 (genuine note R32): the motor areas "should at least look a little fleshy" ------------------------------
  // One small addition to the lit colour of the area materials (see REGION_RENDER.tissue*). It reads the material's own
  // final albedo, so an area shown in the activity colours scatters in those colours and the brain-to-muscle colour
  // match is kept; nothing is added to the emission, the depth or the alpha.
  const tissue = { applied: null, uniforms: { nsTissue: { value: new THREE.Vector4(REGION_RENDER.tissueTint[0], REGION_RENDER.tissueTint[1], REGION_RENDER.tissueTint[2], REGION_RENDER.tissueStrength) }, nsTissueShape: { value: new THREE.Vector2(REGION_RENDER.tissueFloor, REGION_RENDER.tissuePower) } } };
  const TISSUE_HOOK = '#include <opaque_fragment>';
  const tissuePatch = m => composePatch(m, 'ns-tissue-r558', shader => {
    if (typeof shader.fragmentShader !== 'string' || !shader.fragmentShader.includes(TISSUE_HOOK) || !shader.fragmentShader.includes('vViewPosition')) { tissue.applied = false; return; }
    shader.uniforms.nsTissue = tissue.uniforms.nsTissue; shader.uniforms.nsTissueShape = tissue.uniforms.nsTissueShape;
    shader.fragmentShader = 'uniform vec4 nsTissue;\nuniform vec2 nsTissueShape;\n' + shader.fragmentShader.replace(TISSUE_HOOK,
      '{\n  float nsNV = clamp( abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 0.0, 1.0 );\n' +
      '  float nsScatter = nsTissueShape.x + ( 1.0 - nsTissueShape.x ) * pow( 1.0 - nsNV, nsTissueShape.y );\n' +
      '  outgoingLight += diffuseColor.rgb * nsTissue.rgb * ( nsTissue.a * nsScatter );\n}\n' + TISSUE_HOOK);
    tissue.applied = tissue.applied !== false;
  });
  // ---- R558 BB (Messages 24, 29): the comic ink of the motor areas (ns-brain-ink patchAreaInkShaders) ---------------
  // Cel bands of the direct light, the sulcus ink line along the fold depth, the gyrus contour and the hatching across
  // the gyrus; one shared uniform set for every area material. applied: null until an area program compiles.
  const areaInk = { applied: null, cel: null, materials: 0, foldMethod: null, foldMs: null, foldCloudPoints: 0 };
  const areaInkUniforms = (() => {
    const v = areaInkUniformValues(BRAIN_INK, GLASS_READ.lightDir), o = {};
    for (const [k, a] of Object.entries(v)) o[k] = { value: new THREE.Vector4(...a) };
    return o;
  })();
  const areaInkPatch = m => {
    areaInk.materials++;
    return composePatch(m, 'ns-area-ink-bb', shader => {
      const chunk = THREE.ShaderChunk && typeof THREE.ShaderChunk.lights_physical_pars_fragment === 'string' ? THREE.ShaderChunk.lights_physical_pars_fragment : null;
      const p = patchAreaInkShaders(shader.vertexShader, shader.fragmentShader, chunk);
      areaInk.applied = p !== null && areaInk.applied !== false;
      if (!p) return;
      areaInk.cel = p.cel && areaInk.cel !== false;
      shader.vertexShader = p.vertexShader; shader.fragmentShader = p.fragmentShader;
      Object.assign(shader.uniforms, areaInkUniforms);
    });
  };
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
  // ---- R558 (Message 18): the muscle LOOK (patchMuscleLookShaders; one set of uniforms shared by every muscle) -------
  // Every muscle material (your body, its in-place head twin, the mirror body, the left game arm and its mirror twin)
  // takes this patch, so all three items show the same tissue light, tendon ends and outline creases.
  const muscleLook = { applied: null, materials: 0 };
  const muscleLookUniforms = {
    nsMuscleTendon: { value: new THREE.Vector4(MUSCLE_LOOK.tendon[0], MUSCLE_LOOK.tendon[1], MUSCLE_LOOK.tendon[2], MUSCLE_LOOK.tendonMix) },
    nsMuscleShade: { value: new THREE.Vector4(MUSCLE_LOOK.creaseStrength, MUSCLE_LOOK.creasePower, MUSCLE_LOOK.scatterStrength, MUSCLE_LOOK.tendonRoughnessDrop) },
    nsMuscleScatter: { value: new THREE.Vector4(MUSCLE_LOOK.scatterTint[0], MUSCLE_LOOK.scatterTint[1], MUSCLE_LOOK.scatterTint[2], MUSCLE_LOOK.glowCreaseRelief) },
    nsMuscleSheen: { value: new THREE.Vector4(MUSCLE_LOOK.sheenTint[0] * MUSCLE_LOOK.sheenGain, MUSCLE_LOOK.sheenTint[1] * MUSCLE_LOOK.sheenGain, MUSCLE_LOOK.sheenTint[2] * MUSCLE_LOOK.sheenGain, 0) },
    nsMuscleFibre: { value: new THREE.Vector4(MUSCLE_LOOK.fibreAmp, MUSCLE_LOOK.fibreAlong, MUSCLE_LOOK.fibreFadePx, MUSCLE_LOOK.fibreBumpM) }
  };
  /** Per-mesh fibre axis uniform (shared by a mesh's own, mirror and in-place materials): xyz = fibreAxis of its rest
   * positions (source mm), w = 1 / MUSCLE_LOOK.fibreMm; w = 0 (no striation) for a degenerate mesh. */
  const fibreUniform = (positions, id = null) => {
    const a = positions && muscleFibreScale(id) > 0 ? fibreAxis(positions) : null; // R558 (builder FA): none on the face's ring muscles
    return { value: a ? new THREE.Vector4(a[0], a[1], a[2], 1 / MUSCLE_LOOK.fibreMm) : new THREE.Vector4(0, 0, 1, 0) };
  };
  const noFibre = { value: new THREE.Vector4(0, 0, 1, 0) };
  const muscleLookPatch = m => {
    muscleLook.materials++;
    return composePatch(m, 'ns-muscle-look-r558', shader => {
      const p = patchMuscleLookShaders(shader.vertexShader, shader.fragmentShader);
      muscleLook.applied = p !== null && muscleLook.applied !== false;
      if (!p) return;
      shader.vertexShader = p.vertexShader; shader.fragmentShader = p.fragmentShader;
      shader.uniforms.nsMuscleTendon = muscleLookUniforms.nsMuscleTendon;
      shader.uniforms.nsMuscleShade = muscleLookUniforms.nsMuscleShade;
      shader.uniforms.nsMuscleScatter = muscleLookUniforms.nsMuscleScatter;
      shader.uniforms.nsMuscleSheen = muscleLookUniforms.nsMuscleSheen;
      shader.uniforms.nsMuscleFibre = muscleLookUniforms.nsMuscleFibre;
      shader.uniforms.nsFibre = (m.userData && m.userData.nsFibre) || noFibre;
    });
  };
  // ---- R558 (Messages 25 to 29): the COMIC look of every muscle and bone (patchComicShaders; one shared uniform set) --
  // Composed LAST on each muscle material (after the muscle look and the power-up) and on every bone material, so all
  // three items (your body, the left game arm, the mirror body, the in-place head) show the same bands, rim, highlight
  // shapes and ink. The ink is off at the coarse quality levels (comic.inkOn, QUALITY_LEVELS with a lod).
  const C = BODY_CEL, inkLin = hexToLinear(C.ink);
  const comic = { applied: null, materials: 0, inkOn: true, hatchMeshes: 0 };
  const comicUniforms = {
    nsCelBand: { value: new THREE.Vector4(C.bands[0], C.bands[1], C.bands[2], C.soft) },
    nsCelLv: { value: new THREE.Vector4(C.levels[0], C.levels[1], C.levels[2], C.levels[3]) },
    nsCelDeep: { value: new THREE.Vector4(C.deepTint[0], C.deepTint[1], C.deepTint[2], C.deepDesat) },
    nsCelRim: { value: new THREE.Vector4(C.rim.at, C.rim.gain, 0, 0) },
    nsCelRimCol: { value: new THREE.Vector4(C.rim.colour[0], C.rim.colour[1], C.rim.colour[2], 0) },
    nsCelRimDir: { value: new THREE.Vector4(C.rim.dir[0] / Math.hypot(C.rim.dir[0], C.rim.dir[1]), C.rim.dir[1] / Math.hypot(C.rim.dir[0], C.rim.dir[1]), 0, 0) },
    nsCelSpec: { value: new THREE.Vector4(C.spec.bellyAt, C.spec.soft, C.spec.belly, C.spec.tendonBone) },
    nsCelSpecAt: { value: new THREE.Vector4(C.spec.tendonBoneAt, C.boneHigh, C.boneLevels[0], C.boneLevels[1]) }, // y: highlight level of bone / tendon; z, w: their deep and mid levels
    nsCelGloss: { value: new THREE.Vector4(C.gloss.coreMul, C.gloss.coreBelly, C.gloss.coreTendonBone, 0) },
    nsCelGloss2: { value: new THREE.Vector4(C.gloss.smooth, C.gloss.smoothMax, C.gloss.speckRad, 0) },
    nsInk: { value: new THREE.Vector4(inkLin[0], inkLin[1], inkLin[2], 1) },
    nsInkLine: { value: new THREE.Vector4(C.line.minSpacingPx, C.line.fibrePx, C.line.hatchPx, 1) },
    nsInkMix: { value: new THREE.Vector4(C.mix.fibre, C.mix.hatch, C.mix.stipple, C.mix.tendon) },
    nsInkStroke: { value: new THREE.Vector4(C.stroke.mm, C.stroke.inShare, C.stroke.outShare, 0) },
    nsInkStip: { value: new THREE.Vector4(C.stipple.cellMm, C.stipple.at, C.stipple.minCellPx, 0) },
    nsHdrBoost: { value: new THREE.Vector4(0, HDR_BLOOM.muscleFrom, 0, 0) }, // x set while the HDR picture is on
    nsInkFar: { value: new THREE.Vector4(C.line.farFromM, C.line.farToM, C.farSoft, 0) } // z: band half-width on a far figure
  };
  const comicPatch = (m, kind) => {
    comic.materials++;
    return composePatch(m, `ns-comic-r558-${kind}`, shader => {
      const p = patchComicShaders(shader.vertexShader, shader.fragmentShader, kind);
      comic.applied = p !== null && comic.applied !== false;
      if (!p) return;
      shader.vertexShader = p.vertexShader; shader.fragmentShader = p.fragmentShader;
      for (const [k, u] of Object.entries(comicUniforms)) shader.uniforms[k] = u;
    });
  };
  /** The hatch frame attribute (hatchFrame) every geometry drawn with a comic material carries; zeros (no ink) for a
   * degenerate mesh, so the attribute is always bound (never a stale GL default). */
  const hatchAttr = (geo, positions, kind, id = null) => {
    if (!geo || !geo.attributes || !geo.attributes.position) return null;
    if (geo.attributes.nsHatch) return geo.attributes.nsHatch;
    const n = geo.attributes.position.count;
    // No ink lines where lengthwise lines would run the wrong way (builder FA: the face's ring muscles, muscleFibreScale 0).
    const h = positions && positions.length === 3 * n && !(kind === 'muscle' && muscleFibreScale(id) <= 0) ? hatchFrame(positions, { spacingMm: kind === 'bone' ? C.spacingMm.bone : C.spacingMm.muscle }) : null;
    const a = new THREE.BufferAttribute(h ? h.attr : new Float32Array(4 * n), 4);
    geo.setAttribute('nsHatch', a);
    if (h) comic.hatchMeshes++;
    return a;
  };
  for (const m of [boneMaterial, bodyBoneMaterial, torsoBoneMaterial, legBoneMaterial]) comicPatch(m, 'bone');
  // ---- R558 (Message 22): the POWER-UP CHARGE of an activation (ns-colors POWER_UP, patchPowerUpShaders) -------------
  // One clock uniform (x = seconds since this scene was made, y = 1 under prefers-reduced-motion) shared by every muscle,
  // motor area and halo, and ONE start time per AREA: the area on the brain, the muscles it drives on your body and the
  // same muscles on the mirror body charge, flash and pulse together (Message 17). A start is taken when the area, or the
  // first of its muscles, begins to glow; a muscle that begins to glow while its area glows, or within POWER_UP_JOIN_S
  // of the area's last start, takes that same start. Per frame this costs one uniform write; per change of a glow, one.
  const POWER_UP_JOIN_S = 0.35;
  const powerUpEpoch = nowMs();
  const powerUp = { applied: null, materials: 0, starts: 0, settledStarts: 0, recharges: 0, lastStart: null, lastStartArea: null, byArea: new Map() };
  const powerUpSettled = new Set(); // setSettledRegions
  const powerUpClock = { value: new THREE.Vector4(0, reducedMotion ? 1 : 0, 0, 0) };
  const powerUpNow = () => (nowMs() - powerUpEpoch) / 1000;
  const noSweep = { value: new THREE.Vector2(0, 0.5) };
  /** Per-mesh sweep uniform of the power-up front (shared by a mesh's own, mirror and in-place materials and halos). */
  const sweepUniform = (positions, fibre) => {
    const f = fibre && fibre.value && fibre.value.w > 0 ? [fibre.value.x, fibre.value.y, fibre.value.z] : null;
    const s = f && positions ? powerUpSweep(positions, f) : null;
    return { value: s ? new THREE.Vector2(s[0], s[1]) : new THREE.Vector2(0, 0.5) };
  };
  const powerUpPatch = (m, kind) => {
    const u = { value: new THREE.Vector4(-1e4, 0, 0, 0) };
    m.userData.nsCharge = u;
    if (kind === 'muscle') m.userData.nsChargeRest = { value: new THREE.Vector3(0, 0, 0) };
    powerUp.materials++;
    return composePatch(m, `ns-power-up-r558-${kind}`, shader => {
      const p = patchPowerUpShaders(shader.vertexShader, shader.fragmentShader, kind);
      powerUp.applied = p !== null && powerUp.applied !== false;
      if (!p) return;
      shader.fragmentShader = p.fragmentShader;
      shader.uniforms.nsClock = powerUpClock; shader.uniforms.nsCharge = u;
      if (kind === 'muscle') { shader.uniforms.nsChargeRest = m.userData.nsChargeRest; shader.uniforms.nsSweep = m.userData.nsSweep || noSweep; }
    });
  };
  /** The shared charge record of area `id` (null id: the neutral glow of a muscle no area claims). members: the charge
   * uniforms of the muscle materials glowing on that start right now (so a recharge reaches them). */
  const powerUpArea = id => {
    const key = id || '';
    let c = powerUp.byArea.get(key);
    if (!c) { c = { t0: -1e4, on: false, offAt: -1e4, members: new Set() }; powerUp.byArea.set(key, c); }
    return c;
  };
  /** A new deliberate activation of area `id` while it still glows (its activatedRegions count went up): a fresh start
   * now for the area (its charge uniform `areaU`) and every muscle glowing on its start, on both bodies (their halos share
   * the muscles' uniforms), unless the last start is less than POWER_UP.rechargeS old. Returns whether it charged. */
  function powerUpRecharge(id, areaU) {
    const c = powerUpArea(id), now = powerUpNow();
    if (!(now - c.t0 >= POWER_UP.rechargeS)) return false;
    c.t0 = now; powerUp.starts++; powerUp.recharges++; powerUp.lastStart = now; powerUp.lastStartArea = id || null;
    if (areaU) areaU.value.x = now;
    for (const u of c.members) u.value.x = now;
    return true;
  }
  /** The start (clock seconds) a muscle or area of area `id` takes when it begins to glow now: its area's running start
   * while the area glows, went dark less than POWER_UP.rearmS ago (the dance's turns) or started less than
   * POWER_UP_JOIN_S ago; else a new start now. */
  function powerUpJoin(id) {
    const c = powerUpArea(id), now = powerUpNow();
    if (!c.on && now - c.t0 > POWER_UP_JOIN_S && now - c.offAt > POWER_UP.rearmS) {
      // A held-posture glow (setSettledRegions) starts in its settled hold: no charge, no flash.
      const settled = Boolean(id) && powerUpSettled.has(id);
      c.t0 = settled ? now - POWER_UP.settledAgeS : now;
      powerUp.starts++; if (settled) powerUp.settledStarts++;
      powerUp.lastStart = now; powerUp.lastStartArea = id || null;
    }
    return c.t0;
  }
  /** R558 (Message 22): the areas whose glow this frame shows a held posture, not an activation (ns-app: the neck and
   * trunk areas lit only by the mouse look's head turn). Called before the frame's muscles and areas are shaded; an
   * area that begins to glow while listed starts settled (POWER_UP.settledAgeS). `ids`: array of area ids. */
  function setSettledRegions(ids) {
    powerUpSettled.clear();
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string' && id) powerUpSettled.add(id);
  }
  /** The per-vertex tendon attribute every muscle geometry carries (0 until the stack geometry arrives; the patch's
   * attribute must always be bound, never left to a stale GL default). Returns the attribute. */
  const tendonAttr = geo => {
    let a = geo.attributes && geo.attributes.nsTendon;
    if (!a && geo.attributes && geo.attributes.position) { a = new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1); geo.setAttribute('nsTendon', a); }
    return a || null;
  };
  const writeTendon = (geo, rest, full, id = null) => {
    const a = tendonAttr(geo);
    if (!a || !rest || !full || rest.length !== full.length || a.array.length * 3 !== rest.length) return false;
    const t0 = nowMs();
    tendonFromStack(rest, full, a.array, TENDON_FROM_STACK, geo.index ? geo.index.array : null);
    // R558 (builder FA): the face muscles keep little or none of the estimate (ns-colors FACE_MUSCLE_LOOK).
    const k = muscleTendonScale(id);
    if (k !== 1) for (let i = 0; i < a.array.length; i++) a.array[i] *= k;
    a.needsUpdate = true;
    muscleLook.tendonMeshes = (muscleLook.tendonMeshes || 0) + 1;
    muscleLook.tendonMs = (muscleLook.tendonMs || 0) + (nowMs() - t0);
    return true;
  };
  // Per-muscle tones (ns-colors MUSCLE_TONES / assignMuscleTones): side-free key -> tone index, filled by setBody from
  // which muscles touch; a muscle shaded before that (the left game arm) is re-shaded once the tones are known.
  const muscleTones = { byKey: null, contacts: 0, worst: null, keys: 0 };
  // R558 (builder AN): a missing-muscles packet id has no catalogue source name; its packet row name ('right gracilis')
  // stands in, so its two sides share one tone like every catalogue pair.
  const muscleToneKeyOf = id => muscleToneKey(id, typeof id === 'string' ? regionalLayerQualification(id).sourceName || bodyPacketMuscleName(id) : null);
  /** Resting base colour (linear) of the muscle with element id `id`: its tone and storey (ns-colors muscleBaseInto). */
  function muscleBaseOf(id, out = [0, 0, 0]) {
    if (typeof id !== 'string' || !id) return muscleBaseInto(0, null, out);
    const key = muscleToneKeyOf(id);
    const t = muscleTones.byKey && muscleTones.byKey.has(key) ? muscleTones.byKey.get(key) : muscleToneFallback(key);
    // R558: the storey shade follows the full 226-muscle classification (ns-body bodyMuscleLayer: catalogue + the merged
    // supplement tables), not only the muscles the stack lifts, so every deeper muscle reads a little darker.
    return muscleBaseInto(t, typeof bodyMuscleLayer === 'function' ? bodyMuscleLayer(id) : bodyStackLevel(id), out);
  }
  const setMuscleBase = (mat, id) => { if (mat && mat.userData) mat.userData.nsMuscleBase = muscleBaseOf(id); return mat; };
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
  const behindGlass = { applied: null, amount: 0, nearM: 0 };
  const bgUniform = { value: new THREE.Vector4(0, BEHIND_GLASS.dim, 0, 0) }, bgWinUniform = { value: new THREE.Vector4(0, 0, 1, 1) };
  const behindGlassPatch = m => composePatch(m, 'ns-behind-glass-r5', shader => {
    const p = patchBehindGlassShaders(shader.vertexShader, shader.fragmentShader);
    behindGlass.applied = p !== null && behindGlass.applied !== false;
    if (!p) return;
    shader.fragmentShader = p.fragmentShader;
    shader.uniforms.nsBg = bgUniform; shader.uniforms.nsBgWin = bgWinUniform;
  });
  const mirrorBoneMaterial = comicPatch(behindGlassPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.bone, roughness: MATERIAL.boneRoughness, metalness: 0 }))), 'bone');
  // R558 (user Message 20, builder FA): the eyes of the completed head (tissue 'eye': sclera, iris, lens) get their own
  // materials (ns-colors EYE_LOOK), never the ivory bone; one per part for your body in place and one for the mirror
  // (behind-glass patched like every mirror material). The face-layer copy keeps the face bone material (not drawn).
  const eyeMaterials = new Map();
  const eyeMaterial = (part, mirrorTwin) => {
    const key = `${part}|${mirrorTwin ? 'm' : 'o'}`;
    let m = eyeMaterials.get(key);
    if (!m) {
      const look = EYE_LOOK[part];
      m = keep(new THREE.MeshStandardMaterial({ color: look.hex, roughness: look.roughness, metalness: 0 }));
      if (mirrorTwin) behindGlassPatch(m); else overBrainPatch(m); // as the bone materials of each body
      eyeMaterials.set(key, m);
    }
    return m;
  };
  const mirrorMuscleMaterial = () => comicPatch(powerUpPatch(muscleLookPatch(behindGlassPatch(glowRimPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.muscleBase, roughness: MUSCLE_LOOK.roughness, metalness: 0 }))))), 'muscle'), 'muscle');
  // ns-mirror owns the math: bodyBoundsFromPoints (the posed body), mirrorReflectionPlacement (R558: the literal plane
  // reflection, set from the posed body and the eye, independent of the brain), createMirrorState / placeMirror (orbit
  // kept), mirrorTransform (det < 0). The scene keeps a DEFAULT state (placed when the body is posed; orbit from
  // setMirrorView), unless the integrator hands a whole ns-mirror state or transform (setMirrorView), which then wins.
  const mirror = {
    enabled: true, ready: false, posed: false, body: null, samples: null, placement: null, state: null, orbit: { yaw: 0, pitch: 0, push: 0 },
    external: null, worldCentre: null, transform: null, serial: 0, planeSerial: 0, measured: null, lod: false, twins: 0, error: null,
    correction: null, pipelineMatrix: null, reachForemostM: null, // R558 (Message 12): the stop-at-contact correction, the placement before it, the body's reach
    reachSphere: null, // R558 (Message 45): your left hand's reach, { centre (world m), radiusM }: a turned mirror body stands back for its image
    viewAwayM: 0 // R558 (Message 52): the outside view's slide (ns-mirror MIRROR_OUTSIDE), set from the camera pose
  };
  // ---- R5-scene (D18): the render camera. First person: the camera is the eye. Third person: setCameraPose. ----------
  let camPose = null, firstPose = null;
  let referenceOrigin = [0, 0, 0], referenceOriginSet = false, referenceCarry = null, referenceAngles = { yaw: 0, pitch: 0 };
  const activePosition = () => camPose ? camPose.position.slice() : firstPose ? firstPose.position.slice() : [0, 0, 0];
  const brainReferenceOrigin = () => lastBrainTransform && lastBrainTransform.referenceTranslation ? lastBrainTransform.referenceTranslation.slice() : [0, 0, 0];
  const camState = { mode: 'first', headInPlace: false, eyeDistM: 0 };
  let bodyPoseSerial = 0, armPoseSerial = 0; // R5-scene: pose change counters (bodyKeepOut cache)
  // ---- R5-scene (D17): glow links -----------------------------------------------------------------------------------
  const glowState = { links: [], eased: new Map(), lastAt: null, ribbons: 0, mirrorRibbons: 0, cpuMs: 0, rimMuscles: 0, rimAreas: 0, set: 0, lineStart: new Map() };
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
    outline.invalidate(); // R558 (Message 20): the ID target's pixels are gone with the context
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
      // R558 (Message 30): the digit bones (thumb and finger phalanges) are drawn from their rounded display copy.
      const tipPos = /phalan/i.test(String(b.name || '')) ? boneTipDisplay(b.positions, b.indices, { distal: /distal phalanx/i.test(String(b.name)) }) : null;
      if (tipPos) boneTips.meshes++;
      const geo = indexedGeometry(tipPos || b.positions, b.indices);
      hatchAttr(geo, geo.attributes.position.array, 'bone'); // R558 (Messages 24, 29): the ink lines' frame
      geo.computeVertexNormals();
      weldGeometryNormals(geo); // R558 (R33): no lit seams across the files' duplicated vertices
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
      fastPick(mesh); fastPick(tw); // R558: arm bones are rigid (the skinned arm muscles are not, and keep Three's test)
      { const g = outlineGroupForArmSegment(b.segment); outline.register(mesh, { group: g }); outline.register(tw, { group: g, mirror: true }); }
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
      const mat = comicPatch(powerUpPatch(muscleLookPatch(glowRimPatch(ghostPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.muscleBase, roughness: MUSCLE_LOOK.roughness, metalness: 0 }))))), 'muscle'), 'muscle');
      tendonAttr(geo); // R558 (Message 18): tendon ends, written by setArmLayers
      hatchAttr(geo, m.positions, 'muscle', m.id); // R558 (Messages 24, 29): the ink lines' frame, from the rest positions
      // R558 (Message 18): the fibre streaks follow the REST positions (source mm), so they stay on the skinned arm.
      geo.setAttribute('nsRest', new THREE.BufferAttribute(m.positions instanceof Float32Array ? m.positions : Float32Array.from(m.positions), 3));
      const armFibre = fibreUniform(m.positions);
      const armSweep = sweepUniform(m.positions, armFibre); // R558 (Message 22): the power-up front, origin -> insertion
      mat.defines = { ...(mat.defines || {}), NS_FIBRE_REST: '' };
      mat.userData.nsFibre = armFibre;
      mat.userData.nsSweep = armSweep;
      const mesh = haloHost(new THREE.Mesh(geo, mat)); // R558: may carry a glow halo
      mesh.name = String(m.name || 'muscle');
      mesh.frustumCulled = false; // CPU-skinned: the rest bounding sphere would be stale
      mesh.renderOrder = BODY_ORDER.arm;
      armGroup.add(mesh);
      depthTwin(mesh, armDepthMaterial, BODY_ORDER.arm - 0.5, armTwins);
      // R5-scene (D19): the mirror twin shares the CPU-skinned buffers (skinned once for both bodies).
      const tw = haloHost(new THREE.Mesh(geo, mirrorMuscleMaterial()), true);
      setMuscleBase(mat, m.id); setMuscleBase(tw.material, m.id); // R558 (Message 18): its own tone and storey shade
      tw.material.defines = { ...(tw.material.defines || {}), NS_FIBRE_REST: '' };
      tw.material.userData.nsFibre = armFibre;
      tw.material.userData.nsSweep = armSweep;
      tw.userData.nsFullGeometry = geo;
      tw.name = `mirror image: ${mesh.name}`;
      tw.frustumCulled = false;
      tw.matrixAutoUpdate = false;
      mesh.raycast = rawRaycast; tw.raycast = rawRaycast; // R558 (P2): Three's test in a typed loop (vertices move)
      mirrorArmGroup.add(tw);
      mesh.userData.nsMirrorTwin = tw;
      // R558 (Message 20): the outline group of a skinned arm muscle from its skin weight per group (ns-outline
      // outlineGroupForShares: a forearm muscle with long finger tendons stays forearm).
      {
        const sum = new Map(), W = m.weights;
        for (let v = 0; v < n; v++) {
          const g0 = outlineGroupForArmSegment(SEGMENTS[W.i0[v]]);
          sum.set(g0, (sum.get(g0) || 0) + (W.w0 ? W.w0[v] : 1));
          if (W.i1 && W.w1) { const g1 = outlineGroupForArmSegment(SEGMENTS[W.i1[v]]); sum.set(g1, (sum.get(g1) || 0) + W.w1[v]); }
        }
        const g = outlineGroupForShares(sum) || OUTLINE_GROUPS.lFore;
        outline.register(mesh, { group: g }); outline.register(tw, { group: g, mirror: true });
      }
      // One weld cache per muscle: its lifted and blended rest copies move the same vertices, so the vertices that
      // share a position in the rest mesh are treated as one point in every copy (their normals stay shared).
      const weld = { groups: null };
      muscles.push({
        mesh, mat, key: m.muscleKey === undefined ? null : m.muscleKey, rest: m.positions, weld,
        restNormals: computeNormals(m.positions, m.indices, undefined, weld), weights: m.weights, pos, nor, posAttr, norAttr, lastT: NaN,
        mirror: tw, centre: null, centreFor: null,
        // R5-integrate-core (D15): the element id (Body Worlds layers) and the original rest geometry (the skin weights
        // were computed from it; setArmLayers skins a lifted copy with the same weights).
        id: typeof m.id === 'string' ? m.id : null, restBase: m.positions, indices: m.indices, lifted: null
      });
      mesh.userData.elementId = typeof m.id === 'string' ? m.id : null;
    }
  }

  /** R558 (the Body Worlds stack, left arm): liftedById: { elementId: Float32Array } = the FULL-lift rest positions of
   * each lifted left-arm muscle from ns-body armStackLift (rest frame; a per-vertex lift: the vertices at the two ends
   * are the same numbers as in the original, the belly is moved outward, the tissue between stretches). amount 0..1
   * blends the original and the lifted rest positions; amount 0 is exactly the original. The SAME skin weights (from
   * the original rest positions) skin the result, so the lift rides on every arm pose, and the mirror twins share the
   * skinned buffers. Round 3: liftedById may hold EVERY arm muscle, because the display fill (ns-body
   * stackFillOffsets) draws each one slightly fuller; a muscle the stack rule (bodyStackLevel) does not lift may move
   * only by the fill, a lifted one by its gap plus the fill (larger is refused). A display choice on licensed
   * anatomy, never measured anatomy. Returns { lifted (stacked muscles), filled (all with an entry), amount }. */
  let armLayerAmount = 0;
  const liftExtent = (rest, moved) => { // largest vertex displacement (mm) and the count of vertices that did not move
    let max2 = 0, still = 0;
    for (let i = 0; i < rest.length; i += 3) {
      const dx = moved[i] - rest[i], dy = moved[i + 1] - rest[i + 1], dz = moved[i + 2] - rest[i + 2], d2 = dx * dx + dy * dy + dz * dz;
      if (d2 === 0) still++; else if (d2 > max2) max2 = d2;
    }
    return { maxMm: Math.sqrt(max2), still };
  };
  function setArmLayers(liftedById = null, amount = 1) {
    const a = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
    let n = 0, nl = 0, changed = false;
    for (const m of muscles) {
      const level = bodyStackLevel(m.id), stacked = level === 'outer' || level === 'intermediate';
      // Round 3: every arm muscle may take the display fill; only the stacked levels may move further (refused above).
      const L = liftedById && m.id && Object.prototype.hasOwnProperty.call(liftedById, m.id) && liftedById[m.id] instanceof Float32Array && liftedById[m.id].length === m.restBase.length && liftedById[m.id] !== m.restBase ? liftedById[m.id] : null;
      if (L !== m.lifted) {
        const ext = L ? liftExtent(m.restBase, L) : null;
        if (ext && ext.maxMm > stackCapMm(level)) fail('scene_input', 'arm lift moves a muscle further than the stack rule allows');
        m.lifted = L; m.liftExtent = ext; changed = true;
        // R558 (Message 18): tendon white on the anchored ends (the same rule as the body; 0 without stack geometry).
        const tg = m.mesh.userData.nsFullGeometry || m.mesh.geometry;
        if (L) writeTendon(tg, m.restBase, L);
        else { const ta = tendonAttr(tg); if (ta) { ta.array.fill(0); ta.needsUpdate = true; } }
      }
      if (!m.lifted) {
        if (m.rest !== m.restBase) { m.rest = m.restBase; m.restNormals = computeNormals(m.restBase, m.indices, undefined, m.weld); changed = true; }
        const bw = Object.freeze({ ...regionalLayerMetadata(m.id, false), stackLevel: level, displaySelected: false, displayStatus: 'not-selected',
          offsetMm: 0, targetOffsetMm: 0, anchoredVertices: 0, amount: a, offsetMeaning: 'largest-vertex-displacement', offsetFrame: 'source-rest-mm' });
        m.mesh.userData.bodyWorlds = bw;
        if (m.mirror) m.mirror.userData.bodyWorlds = bw;
        continue;
      }
      n++; if (stacked) nl++;
      let r;
      if (a >= 1) r = m.lifted;
      else if (a <= 0) r = m.restBase;
      else { r = new Float32Array(m.restBase.length); for (let i = 0; i < r.length; i++) r[i] = m.restBase[i] + a * (m.lifted[i] - m.restBase[i]); }
      if (r !== m.rest) { m.rest = r; m.restNormals = computeNormals(r, m.indices, undefined, m.weld); changed = true; }
      // The lift is per vertex (zero at the anchored ends): the report is the LARGEST source-rest displacement over the
      // muscle, full target and applied blend kept apart, and how many vertices the full lift leaves where they were.
      const ext = m.liftExtent;
      const bw = Object.freeze({
        ...regionalLayerMetadata(m.id, stacked), stackLevel: level, displaySelected: stacked,
        displayStatus: a > 0 ? (stacked ? 'applied' : 'filled') : 'off',
        offsetMm: Math.round(ext.maxMm * a * 10) / 10,
        targetOffsetMm: Math.round(ext.maxMm * 10) / 10,
        anchoredVertices: ext.still,
        amount: a, offsetMeaning: 'largest-vertex-displacement', offsetFrame: 'source-rest-mm'
      });
      m.mesh.userData.bodyWorlds = bw;
      if (m.mirror) m.mirror.userData.bodyWorlds = bw;
    }
    if (changed || a !== armLayerAmount) { armLayerAmount = a; lastMatrices = null; } // re-skin on the next updatePose
    return { lifted: nl, filled: n, amount: armLayerAmount };
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
    // R558 (performance, glassAll): every piece's nsSulc / nsNear attribute is a VIEW into one array of all pieces, so
    // the merged geometry that is drawn shares the values (and the background fold's later writes) without a copy.
    let glassVertices = 0;
    for (const g of glassList) { checkMesh(g, `glass ${g && g.name}`); glassVertices += g.positions.length / 3; }
    const allSulc = new Float32Array(glassVertices), allNear = stripLists.length ? new Float32Array(glassVertices) : null;
    let glassAt = 0;
    glassList.forEach((g, gi) => {
      const geo = indexedGeometry(g.positions, g.indices), nv = g.positions.length / 3;
      geo.computeVertexNormals();
      const sulc = allSulc.subarray(glassAt, glassAt + nv);
      sulc.set(sulcalDepth(g.positions, brainSupport, { lo: GLASS_READ.sulcLoMm, hi: GLASS_READ.sulcHiMm }));
      geo.setAttribute('nsSulc', new THREE.BufferAttribute(sulc, 1));
      if (allNear) {
        const near = allNear.subarray(glassAt, glassAt + nv);
        near.set(stripProximity(g.positions, stripLists, GLASS_CLEAR.radiusMm));
        geo.setAttribute('nsNear', new THREE.BufferAttribute(near, 1));
      }
      geo.userData.nsGlassAt = glassAt; // first vertex of this piece in the merged buffers
      glassAt += nv;
      const mesh = still(new THREE.Mesh(geo, glassMaterial));
      mesh.name = String(g.name || 'brain glass');
      mesh.userData.nsXray = xraySet.has(gi);
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
    if (glass.length && glass[0].layers && typeof glass[0].layers.set === 'function') {
      const G = glassAll.full = glassAllBuild(allSulc, allNear);
      const one = (geo, material, order, name) => {
        const m = still(new THREE.Mesh(geo, material));
        m.name = name; m.renderOrder = order;
        brainGroup.add(m);
        return m;
      };
      glassAll.shell = one(G.all, glassMaterial, RENDER_ORDER.glass, 'brain glass (every piece, one draw)');
      glassAll.depth = one(G.all, glassDepthMaterial, RENDER_ORDER.glassDepth, 'brain glass (every piece, depth pre-pass)');
      glassAll.xray = G.xray ? one(G.xray, glassXrayMaterial, RENDER_ORDER.glassXray, 'brain glass (x-ray pieces, one draw)') : null;
      for (const list of [glass, glassDepth, glassXray]) for (const m of list) m.layers.set(GLASS_PIECE_LAYER);
      raycaster.layers.enable(GLASS_PIECE_LAYER);
    }
    // R558 (Message 12: "moved to and around each other but not through"): the glass brain as a solid, from every brain
    // mesh as given (the strip meshes included): the sealed inside of its surface patches (ns-collide solidGrid, source
    // mm, about 0.1 s once at load). The app's stop-at-contact rule refuses any move that would leave a point of either
    // body in it. Null when it cannot be built (the rule then rests on the sphere covers alone).
    try {
      const solidMeshes = glassListIn.filter(g => g && g.positions && g.positions.length >= 9).map(g => ({ positions: g.positions, indices: g.indices || null }));
      const t1 = nowMs();
      brainSolid = solidMeshes.length ? NsCollide.solidGrid(solidMeshes, { cellMm: NsCollide.COLLIDE.brainSolidCellMm }) : null;
      brainSolidMs = nowMs() - t1;
    } catch (err) { brainSolid = null; brainSolidError = String((err && err.message) || err); }
    if (regionMode) buildRegions(seg, still);
    else buildFocusStrip(focus, markerList, still);
    // R558 BB2 (target 2): the glass's own sulci from the atlas, computed in short background slices (glassFold).
    startGlassFold(glassListIn);
    buildMarkers(markerList, still);
    rayTargets = regionMode ? [...glass, ...regionMeshes] : [...glass, strip.mesh]; // HUD-only raycast targets, built once
    for (const m of rayTargets) fastPick(m); // R558: rigid under the brain group
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

  /** R558 (REGION_BORDER): an area part's own triangles get the smooth strip normals (welded over the whole strip mesh,
   * so no shading seam at the area borders or the OBJ seams), the strip coordinate nsS and its owner row. */
  function borderAttributes(geo, part, border) {
    const n = part.positions.length / 3, N = border.normals.get(part.meshId), src = part.sourceIndex;
    if (N && src && src.length === n) {
      const nor = new Float32Array(3 * n);
      for (let v = 0; v < n; v++) { const k = 3 * src[v]; nor[3 * v] = N[k]; nor[3 * v + 1] = N[k + 1]; nor[3 * v + 2] = N[k + 2]; }
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    } else geo.computeVertexNormals();
    const S = part.s && part.s.length === n ? part.s : part.u;
    geo.setAttribute('nsS', new THREE.BufferAttribute(S instanceof Float32Array ? S : Float32Array.from(S), 1));
    const row = border.rowFor(part), rows = new Float32Array(2 * n);
    for (let v = 0; v < n; v++) rows[2 * v] = Number.isInteger(row) ? row : 0;
    geo.setAttribute('nsRow', new THREE.BufferAttribute(rows, 2));
    const C = border.cavity.get(part.meshId);
    if (C && src && src.length === n) { const cav = new Float32Array(n); for (let v = 0; v < n; v++) cav[v] = C[src[v]]; geo.setAttribute('nsCav', new THREE.BufferAttribute(cav, 1)); }
    const D = border.relief && border.relief.get(part.meshId); // R558 BB2: the strip's relief depth (mm)
    if (D && src && src.length === n) { const rel = new Float32Array(n); for (let v = 0; v < n; v++) rel[v] = D[src[v]]; geo.setAttribute('nsRelief', new THREE.BufferAttribute(rel, 1)); }
  }

  /** R558 (REGION_BORDER): per area and strip mesh / surface rule, the NEIGHBOURS' triangles whose corners reach into a
   * run the area owns, drawn with the area's own material (it keeps only its own fragments), never picked: the picker's
   * targets stay the areas' own triangles, which cover the strip once. */
  function buildRegionFills(seg, border, still) {
    const t0 = nowMs();
    const groups = new Map();
    for (const part of seg.parts) {
      if (!part || !(part.faceCount > 0)) continue;
      const row = border.rowFor(part);
      if (!Number.isInteger(row)) continue;
      const k = `${part.meshId}|${row}`;
      if (!groups.has(k)) groups.set(k, { row, parts: [] });
      groups.get(k).parts.push(part);
    }
    const regionIndexById = new Map(seg.regions.map((r, i) => [r.id, i]));
    for (const { row, parts } of groups.values()) {
      const runs = border.rows[row];
      const fills = new Map(); // region index -> { pos: [], nor: [], s: [], hemisphere }
      for (const part of parts) {
        const P = part.positions, I = part.indices, n = P.length / 3;
        const S = part.s && part.s.length === n ? part.s : part.u;
        const N = border.normals.get(part.meshId), src = part.sourceIndex, C = border.cavity.get(part.meshId), D = border.relief && border.relief.get(part.meshId);
        const ownId = regionIndexById.get(part.regionId);
        for (let t = 0; t + 2 < I.length; t += 3) {
          const a = I[t], b = I[t + 1], c = I[t + 2];
          const lo = Math.min(S[a], S[b], S[c]), hi = Math.max(S[a], S[b], S[c]);
          for (const run of runs) {
            if (run.owner === null || run.hi <= lo || run.lo > hi) continue;
            const id = border.idOf(run.owner);
            if (id < 0 || id === ownId) continue;
            let f = fills.get(id);
            if (!f) { f = { pos: [], nor: [], s: [], cav: [], rel: [], hemisphere: part.hemisphere }; fills.set(id, f); }
            for (const v of [a, b, c]) {
              f.pos.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]);
              if (N && src) { const k = 3 * src[v]; f.nor.push(N[k], N[k + 1], N[k + 2]); }
              if (C && src) f.cav.push(C[src[v]]);
              if (D && src) f.rel.push(D[src[v]]);
              f.s.push(S[v]);
            }
          }
        }
      }
      for (const [id, f] of fills) {
        const rec = regions[id];
        if (!rec || rec.region !== seg.regions[id]) continue;
        const nv = f.s.length;
        const geo = keep(new THREE.BufferGeometry());
        geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(f.pos), 3));
        if (f.nor.length === 3 * nv) geo.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(f.nor), 3));
        else geo.computeVertexNormals();
        geo.setAttribute('nsS', new THREE.BufferAttribute(Float32Array.from(f.s), 1));
        if (f.cav.length === nv) geo.setAttribute('nsCav', new THREE.BufferAttribute(Float32Array.from(f.cav), 1));
        if (f.rel.length === nv) geo.setAttribute('nsRelief', new THREE.BufferAttribute(Float32Array.from(f.rel), 1));
        const rows = new Float32Array(2 * nv);
        for (let v = 0; v < nv; v++) { rows[2 * v] = row; rows[2 * v + 1] = 1; }
        geo.setAttribute('nsRow', new THREE.BufferAttribute(rows, 2));
        geo.computeBoundingSphere();
        const mesh = still(new THREE.Mesh(geo, rec.material));
        mesh.name = `motor region fill: ${rec.id} (neighbouring strip triangles, drawn only where this area owns the strip; ${f.hemisphere} hemisphere)`;
        mesh.userData = { regionId: rec.id, hemisphere: f.hemisphere, regionFill: true };
        mesh.renderOrder = RENDER_ORDER.region;
        mesh.raycast = () => {}; // never picked: the area's own triangles are the pick targets
        if (regionBorder.applied === false) mesh.visible = false;
        brainGroup.add(mesh);
        rec.fillMeshes.push(mesh);
        regionBorder.fillMeshes++;
        regionBorder.fillTriangles += nv / 3;
      }
    }
    regionBorder.ms = (regionBorder.ms || 0) + Math.round(nowMs() - t0);
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
    // R558 (Message 18): per-fragment areas with in-pass borders (REGION_BORDER). Without them (older ns-brain), the
    // whole-triangle areas, the left-arm rim and the line outlines as before.
    const border = regionBorderSetup(seg);
    const leftParts = [];
    if (!border) for (const r of seg.regions) if (r.isLeftArm) for (const pi of r.partIndices || []) { const part = seg.parts[pi]; if (part && part.faceCount > 0 && !leftParts.includes(part)) leftParts.push(part); }
    const t0Rim = nowMs();
    const leftBorder = leftParts.length ? weldedBoundarySegments(leftParts) : null;
    const lines = hasLines && !border;
    for (const r of seg.regions) {
      const material = keep(new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: REGION_RENDER.roughness, metalness: REGION_RENDER.metalness, transparent: true,
        opacity: regionStyle.restOpacity, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      }));
      material.forceSinglePass = true;
      if (border) regionBorderPatch(material, r, border.index.get(r));
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
      tissuePatch(material); // R558 (R32): soft tissue scatter (lighting only)
      powerUpPatch(material, 'area'); // R558 (Message 22): the power-up charge, in step with its muscles
      if (border) areaInkPatch(material); // R558 BB (Messages 24, 29): cel bands, folds, contour and hatching in ink
      const rec = { region: r, id: r.id, index: regions.length, material, meshes: [], depthMeshes: [], fillMeshes: [], outline: null, key: '', activity: 0, activated: 0, hovered: false, opacity: regionStyle.restOpacity, hintKey: '' };
      const edgeLists = [];
      for (const pi of r.partIndices || []) {
        const part = seg.parts[pi];
        if (!part || !(part.faceCount > 0)) continue;
        const geo = indexedGeometry(part.positions, part.indices);
        if (border) borderAttributes(geo, part, border);
        else geo.computeVertexNormals();
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
        if (lines) edgeLists.push(part);
      }
      // R3-scene: a SMOOTH region outline (Chaikin-smoothed, lifted off the surface) instead of the raw triangle-edge
      // zigzag. At rest only the left-arm sub-areas show a faint one; every region shows it while hovered or activated.
      // R558: only without the in-pass borders (REGION_BORDER), which replace these line outlines.
      if (lines && edgeLists.length) {
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
    if (border) buildRegionFills(seg, border, still);
    // R558 BB (Message 24): the whole strip as ONE geometry in the brain group's frame for the outline pass's strip
    // silhouette (seen from above: the central and precentral sulci that bound it), drawn after the areas.
    {
      let nv = 0, ni = 0;
      for (const m of regionMeshes) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
      if (nv > 0 && nv < 65536 * 64) {
        const P = new Float32Array(3 * nv), I = new Uint32Array(ni);
        let ov = 0, oi = 0;
        for (const m of regionMeshes) {
          const a = m.geometry.attributes.position, ix = m.geometry.index;
          P.set(a.array.subarray(0, 3 * a.count), 3 * ov);
          if (ix) for (let i = 0; i < ix.count; i++) I[oi + i] = ix.array[i] + ov;
          else for (let i = 0; i < a.count; i++) I[oi + i] = i + ov;
          ov += a.count; oi += ix ? ix.count : a.count;
        }
        const g = keep(new THREE.BufferGeometry());
        g.setAttribute('position', new THREE.BufferAttribute(P, 3));
        g.setIndex(new THREE.BufferAttribute(I, 1));
        g.computeBoundingSphere();
        areaInk.stripSilhouette = outline.setStrip(g, brainGroup);
      }
    }
    // R558: the label twins mirror in the middle of the motor strip's own width (see regionLabelGroups); once, at build.
    let stripX0 = Infinity, stripX1 = -Infinity;
    for (const m of regionMeshes) { const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i++) { const x = a.getX(i); if (x < stripX0) stripX0 = x; if (x > stripX1) stripX1 = x; } }
    labelGroups = regionLabelGroups(seg.regions, { midX: stripX1 > stripX0 ? (stripX0 + stripX1) / 2 : 0 });
    if (lines) {
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
        // R3-scene (D3): plain words. The body part reads first and large. R558: the two arm labels are twins in one
        // style (the strong pill with the brain-half line, "Left arm / brain's right half" and "Right arm / brain's left
        // half"); the left-arm one keeps its own class name as a marker only.
        const disp = regionLabelDisplay(g);
        if (!disp) continue;
        const strong = g.isLeftArm || g.key === 'arm';
        const e = el('div', `ns-region-label ns-r3${strong ? ' ns-region-label-arm' : ''}${g.isLeftArm ? ' ns-region-label-leftarm' : ''}`, overlay);
        el('span', 'ns-region-label-part', e).textContent = disp.main;
        if (disp.sub) el('span', 'ns-region-label-hemi', e).textContent = disp.sub;
        e.setAttribute('data-ns-region-group', `${g.hemisphere}:${g.key}`);
        e.setAttribute('aria-label', g.text);
        e.title = g.text;
        e.hidden = true;
        labelEls.push({ el: e, group: g, display: disp, shownNow: false, last: { left: '', top: '', shown: false, hover: false, faded: false } });
        // Estimated label box (no layout reads): R3_LABEL_FONT sizes, bold sans-serif ~0.6 em per character + padding.
        const F = R3_LABEL_FONT;
        const w = strong ? Math.max(disp.main.length * F.leftArmPx * 0.62, disp.sub.length * F.subPx * 0.55) + 2 * F.padXPx : disp.main.length * F.otherPx * 0.6 + 2 * F.padXPx;
        const h = strong ? F.leftArmPx * 1.25 + F.subPx * 1.25 + 2 * F.padYPx : F.otherPx * 1.3 + 2 * F.padYPx;
        labelBoxes.push({ x: 0, y: 0, w: Math.ceil(w), h: Math.ceil(h), skip: true });
        labelItems.push({ id: `${g.hemisphere}:${g.key}`, x: NaN, y: NaN, w: Math.ceil(w), h: Math.ceil(h), priority: REGION_LABEL_PRIORITY[g.key] || 0, required: g.isLeftArm, text: disp.main, pair: g.pair || null, mirror: 0 });
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
    // R558 (Message 2): the area's own fresnel rim (its glow colour), set here from its activity, not from the links.
    const rimU = rec.material.userData && rec.material.userData.nsGlowRim;
    if (rimU) rimU.value.set(s.rim[0], s.rim[1], s.rim[2], GLOW_K.rimPower);
    rec.material.opacity = s.opacity;
    rec.opacity = s.opacity;
    // R558 (REGION_BORDER): the hovered area is outlined from the inside in the hover colour, a switched-on one in gold.
    const bu = rec.material.userData && rec.material.userData.nsBorder;
    if (bu) {
      const c = hovered ? borderHoverColor : n >= 1 ? borderMarkColor : null;
      if (c) bu.nsHi.value.set(c.r, c.g, c.b, hovered ? REGION_BORDER.hoverPx : REGION_BORDER.activatedPx);
      else bu.nsHi.value.set(0, 0, 0, 0);
    }
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
    {
      // The un-turned placement for the arrows' rest box: the transform's own restMatrix, or this matrix when the
      // brain is not turned. A transform that is turned and carries no restMatrix leaves the last one in place.
      const r = transform.restMatrix, turned = (Number.isFinite(transform.orbitYaw) && transform.orbitYaw !== 0) || (Number.isFinite(transform.orbitPitch) && transform.orbitPitch !== 0);
      if (r && r.length === 16 && Array.prototype.every.call(r, Number.isFinite)) brainRestElements = Float64Array.from(r);
      else if (!turned) brainRestElements = Float64Array.from(m);
      else brainRestElements = null;
    }
    farEyeView.rot = transform.rotation ? Array.from(transform.rotation) : null;
    farEyeView.pw = transform.pivotWorld ? Array.from(transform.pivotWorld) : null;
    farEyeView.K = Number.isFinite(transform.perspectiveK) ? transform.perspectiveK : 1;
    {
      const ok = a => a && a.length === 3 && Array.prototype.every.call(a, Number.isFinite);
      const viewAxis = transform.pictureAxis === 'view' && ok(transform.squashAxis) && ok(transform.squashAxis0);
      farEyeView.axis = viewAxis ? Array.from(transform.squashAxis) : null;
      farEyeView.axis0 = viewAxis ? Array.from(transform.squashAxis0) : null;
    }
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
    if (cameraProjectionPlan && cameraProjectionPlan.phase === 'locked') cameraProjectionPlan.actualBrainSeen = true;
    updateCameraRange();
    overlayDirty = true;
    return true;
  }

  /** R4-scene: the far plane follows the brain's farthest support point (farPlaneFor), so a brain moved farther away is
   * never clipped; the near plane stays CAMERA.near for the hand. Called whenever the brain transform changes. */
  let cameraProjectionPlan = null;
  const cameraRange = { far: far, brainFarM: null, brainNearM: null, mirrorFarM: null };
  function releaseCameraProjectionPlan() { checkCameraProjectionMatrices(); cameraProjectionPlan = null; }
  /** R558: discard the pre-pick projection plan of a frame the app REFUSED (nothing was drawn with it). Unlike
   * releaseCameraProjectionPlan this runs no check, because there is no drawn frame to certify; it reports whether a
   * plan was pending. The next frame must plan again; a locked plan is never reused. */
  function abandonCameraProjectionPlan() { const had = cameraProjectionPlan !== null; cameraProjectionPlan = null; return had; }
  function projectionRefuse(reason, detail = null) {
    const err = new Error(`ns:scene_input: ${reason}`); err.code = 'actual_camera_projection_refused';
    err.detail = { status: 'refused', reason, detail, projectionPlan: cameraProjectionPlan && cameraProjectionPlan.snapshot,
      current: { cameraToWorld: Array.from(camera.matrixWorld.elements), worldToCamera: Array.from(camera.matrixWorldInverse.elements), projectionMatrix: Array.from(camera.projectionMatrix.elements), nearM: camera.near, farM: camera.far, range: { ...cameraRange } } };
    throw err;
  }
  function checkCameraProjectionMatrices() {
    if (!cameraProjectionPlan || cameraProjectionPlan.phase !== 'locked') return;
    const s = cameraProjectionPlan.snapshot;
    for (const [a, b] of [[camera.matrixWorld.elements, s.cameraToWorld], [camera.matrixWorldInverse.elements, s.worldToCamera], [camera.projectionMatrix.elements, s.projectionMatrix]]) {
      if (a.length !== 16 || Array.from(a).some((v, i) => !Object.is(v, b[i]))) projectionRefuse('preselected full camera/projection changed after picking');
    }
  }
  function checkCameraProjectionPlan() {
    if (!cameraProjectionPlan || cameraProjectionPlan.phase !== 'locked') return;
    // Final range validation uses the original support/farPlaneFor algorithm after all actual body/mirror updates.
    cameraProjectionPlan.actualBrainSeen = true; updateCameraRange();
    checkCameraProjectionMatrices();
  }
  function updateCameraRange() {
    if (cameraProjectionPlan && cameraProjectionPlan.phase === 'locked' && !cameraProjectionPlan.actualBrainSeen) return;
    const P = brainSupport && brainSupport.points;
    if (!P || P.length < 3) return;
    const e = cameraProjectionPlan && cameraProjectionPlan.phase === 'planning' && cameraProjectionPlan.brainMatrix
      ? cameraProjectionPlan.brainMatrix : brainGroup.matrixWorld.elements;
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
      const a = cameraProjectionPlan && cameraProjectionPlan.phase === 'planning' && cameraProjectionPlan.mirrorWorldCentre
        ? cameraProjectionPlan.mirrorWorldCentre : mirror.transform.centre;
      const dm = Math.hypot(a[0] - cx, a[1] - cy, a[2] - cz) + mirror.transform.scale * mirror.body.radius;
      cameraRange.mirrorFarM = dm;
      if (dm > fFar) fFar = dm;
    }
    const f = farPlaneFor(fFar, far);
    if (cameraProjectionPlan && cameraProjectionPlan.phase === 'locked' && f !== cameraProjectionPlan.snapshot.farM) projectionRefuse('final brain/mirror range differs from pre-pick projection plan', { candidateFarM: f, originalBaseFarM: far });
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
    referenceOrigin = Array.from(position); referenceCarry = Array.from(K); referenceAngles = { yaw: initialPlacement.yaw, pitch: initialPlacement.pitch }; referenceOriginSet = true;
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
    if (pose && pose.projectionPlanning) {
      if (cameraProjectionPlan) fail('scene_input', 'previous camera projection frame not released');
      const m = pose.projectionPlanning.brainMatrix;
      if (m !== null && (!m || m.length !== 16 || !Array.from(m).every(Number.isFinite))) fail('scene_input', 'planned brain matrix needs finite16 or null');
      const mirrorCentre = pose.projectionPlanning.mirrorWorldCentre;
      if (mirrorCentre !== undefined && mirrorCentre !== null && (!mirrorCentre || mirrorCentre.length !== 3 || !Array.from(mirrorCentre).every(Number.isFinite))) fail('scene_input', 'planned mirror centre needs finite world metres');
      cameraProjectionPlan = { phase: 'planning', brainMatrix: m === null ? null : Array.from(m), mirrorWorldCentre: mirrorCentre ? Array.from(mirrorCentre) : null, actualBrainSeen: false, snapshot: null };
    }
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
    // R558 (Message 52): in the outside view the mirror body backs away from your body as far as the camera does.
    const viewAwayM = camPose ? fin01(camPose.blend) * NsMirror.MIRROR_OUTSIDE.awayM : 0;
    if (Math.abs(viewAwayM - mirror.viewAwayM) > 1e-4) { mirror.viewAwayM = viewAwayM; if (mirror.transform) applyMirror(); }
    applyCamera();
    updateCameraRange();
    if (cameraProjectionPlan && cameraProjectionPlan.phase === 'planning') {
      const copy16 = a => { if (!a || a.length !== 16 || !Array.from(a).every(Number.isFinite)) fail('scene_input', 'actual camera/projection needs finite16'); return Object.freeze(Array.from(a)); };
      cameraProjectionPlan.snapshot = Object.freeze({ kind: 'ns-prepick-actual-camera-r425-v1',
        cameraToWorld: copy16(camera.matrixWorld.elements), worldToCamera: copy16(camera.matrixWorldInverse.elements), projectionMatrix: copy16(camera.projectionMatrix.elements),
        sourcePose: Object.freeze({ position: Object.freeze(Array.from(pose.position)), yaw: pose.yaw, pitch: pose.pitch, view: pose.view, progress: pose.progress, blend: pose.blend }),
        nearM: camera.near, farM: camera.far, aspect: camera.aspect, fovYDeg: camera.fov, cssWidth: cssW, cssHeight: cssH,
        rangeMeaning: 'Existing farPlaneFor/support algorithm on known copied carry; final unknown gaze/orbit/mirror changes must match or refuse, never change locked P' });
      cameraProjectionPlan.phase = 'locked';
    }
    overlayDirty = true;
    return pose && pose.projectionPlanning ? { ...cameraState(), projectionPlan: cameraProjectionPlan.snapshot } : cameraState();
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
    if (cameraProjectionPlan && cameraProjectionPlan.phase === 'locked' && nearNow !== cameraProjectionPlan.snapshot.nearM) projectionRefuse('preselected camera near changed', { candidateNearM: nearNow });
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
    if (lastMatrices !== null && matricesEqual(lastMatrices, matrices)) return false;
    armAppliedReady = false; // R173: a partial/throwing application is not a complete retained pose.
    for (const b of bones) {
      const m = matrices.get(b.segment);
      if (!m) fail('scene_input', `missing matrix for ${b.segment}`);
      b.mesh.matrix.fromArray(m);
      b.mesh.matrixWorldNeedsUpdate = true;
      if (b.mirror) { b.mirror.matrix.fromArray(m); b.mirror.matrixWorldNeedsUpdate = true; }
    }
    for (const m of muscles) {
      skinPositionsAndNormals(matrices, m.weights, m.rest, m.restNormals, m.pos, m.nor); // R558 (P2): one pass, same numbers
      m.posAttr.needsUpdate = true;
      m.norAttr.needsUpdate = true;
    }
    lastMatrices = matrices;
    armPoseSerial++;
    armAppliedReady = true;
    return true;
  }

  /** R173 public CPU scene-state readback. updatePose keeps its boolean API. On an unchanged-pose skip, the bones
   * contain the previous numerically identical APPLIED matrices; never substitute a requested Map for retained state.
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
      'Current main-camera main scene and active ghost-face pass only; inset-face pass, DOM/HUD, lines/points/sprites, the outline composite (screen-space display pass) and scene background are outside triangle scope',
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
      tag(glassAll.shell, 'brain-glass'); tag(glassAll.depth, 'brain-glass-depth'); tag(glassAll.xray, 'brain-glass-xray'); // the meshes that are drawn
      for (const region of regions) {
        for (const mesh of region.meshes) tag(mesh, 'brain-region', null, false, null, region.id);
        for (const mesh of region.depthMeshes) tag(mesh, 'brain-region-depth', null, false, null, region.id);
        for (const mesh of region.fillMeshes || []) tag(mesh, 'brain-region-fill', null, false, null, region.id);
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
        if (outline && object === outline.composite) continue; // R558 (hunt 3): the outline's screen-space pass is a display aid, not a surface
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
      m.lastT = t;
      shadeArmMuscle(m);
      m.mesh.userData.activity = t;
    }
  }

  /** R558 (Message 2): a muscle glows in the colour of the area that drives it (ns-colors AREA_COLORS), with the same
   * strength rule as the area (ns-colors glowIntensity of its drive) and a fresnel rim of that colour (the soft halo).
   * The lit tissue albedo keeps the shared darkening rule (activityShadeInto), so a resting muscle looks as before
   * (the resting 0.08 drive is below the glow onset: no emission at all). areaId null = no area claims it (a neutral
   * warm glow). The SAME call shades your body, its in-place head copy and the mirror body, so all three match. */
  const muscleRim = [0, 0, 0];
  function shadeMuscle(mat, t, areaId = null, hint = false) {
    // A muscle lit only by an opposing-action hint (Message 6) stays faint: AREA_LOOK.hintGain of the emission and rim,
    // no halo, and its RESTING red-brown surface (darkening it under a faint blue emission read as a grey, discoloured
    // muscle on the near arm, not as a highlight).
    // R558 (Message 18): the muscle's own tone and storey shade (setMuscleBase), else the shared fallback colour.
    const base = mat.userData && mat.userData.nsMuscleBase ? mat.userData.nsMuscleBase : muscleBaseLinear;
    // R558 (Message 22): the power-up charge. The resting albedo (for the part the energy front has not reached yet),
    // and the start: a muscle that begins to glow joins its area's start (powerUpJoin), so all three items run in step;
    // a hint glows calm (no charge, flash, pulse or ripple).
    const cu = mat.userData && mat.userData.nsCharge;
    if (cu) {
      activityShadeInto(base, MUSCLE_REST_DRIVE, muscleShade);
      const cr = mat.userData.nsChargeRest;
      if (cr) cr.value.set(muscleShade.albedo[0], muscleShade.albedo[1], muscleShade.albedo[2]);
      const on = glowIntensity(t) > 0;
      // A change of owning area while glowing (the first frame often shades with the body-part fallback area before the
      // links name the real one) takes the new area's start as well.
      // While it glows on a start the muscle is one of its area's members, so a recharge of the area (a second click,
      // powerUpRecharge) restarts it too.
      if (on && !hint && (mat.userData.nsChargeOn !== true || mat.userData.nsChargeArea !== areaId)) {
        if (mat.userData.nsChargeOn === true) powerUpArea(mat.userData.nsChargeArea).members.delete(cu);
        cu.value.x = powerUpJoin(areaId);
        powerUpArea(areaId).members.add(cu);
      } else if (!(on && !hint) && mat.userData.nsChargeOn === true) {
        const c = powerUpArea(mat.userData.nsChargeArea);
        c.offAt = powerUpNow();
        c.members.delete(cu);
      }
      mat.userData.nsChargeOn = on && !hint;
      mat.userData.nsChargeArea = areaId;
      cu.value.y = hint ? 1 : 0;
      cu.value.z = on ? 1 : 0;
    }
    activityShadeInto(base, hint ? MUSCLE_REST_DRIVE : t, muscleShade);
    const hk = hint ? AREA_LOOK.hintGain : 1;
    // R558 (Message 18): a dim yellow glow reads as olive on a belly in shade; yellows emit a little more (ns-colors).
    const rcG = areaRecord(areaId), gs = rcG ? muscleGlowGainScale(rcG.glowLinear) : 1;
    const k = areaGlowInto(areaId, t, AREA_LOOK.muscleGain * hk * gs, muscleShade.emission);
    // R558 (issue hunt 2, Message 18 "never ... diseased-looking"): a hint no longer lays its faint emission over the
    // whole belly (a dim green over red-brown tissue read as a murky olive belly); the hinted muscle keeps its resting
    // tissue colour and gets only a thin, clean rim in a lighter tint of its area's colour (MUSCLE_HINT_LOOK).
    if (hint) muscleShade.emission[0] = muscleShade.emission[1] = muscleShade.emission[2] = 0;
    if (k > 0 && !hint) {
      // Lit albedo toward the glow colour by the glow strength (AREA_LOOK.muscleAlbedo): shaded and round, not flat.
      const rc = areaRecord(areaId), g = rc ? rc.glowLinear : null;
      if (g) for (let i = 0; i < 3; i++) muscleShade.albedo[i] += (g[i] * AREA_LOOK.muscleAlbedo - muscleShade.albedo[i]) * k;
    }
    mat.color.setRGB(muscleShade.albedo[0], muscleShade.albedo[1], muscleShade.albedo[2]);
    mat.emissive.setRGB(muscleShade.emission[0], muscleShade.emission[1], muscleShade.emission[2]);
    const u = mat.userData && mat.userData.nsGlowRim;
    if (u && hint) {
      const g = rcG ? rcG.glowLinear : null, H = MUSCLE_HINT_LOOK;
      if (g && k > 0) u.value.set((g[0] + (1 - g[0]) * H.rimWhite) * H.rimGain, (g[1] + (1 - g[1]) * H.rimWhite) * H.rimGain, (g[2] + (1 - g[2]) * H.rimWhite) * H.rimGain, H.rimPower);
      else u.value.set(0, 0, 0, H.rimPower);
    } else if (u) { areaGlowInto(areaId, t, AREA_LOOK.muscleRimGain * hk, muscleRim); u.value.set(muscleRim[0], muscleRim[1], muscleRim[2], Number.isFinite(AREA_LOOK.muscleRimPower) ? AREA_LOOK.muscleRimPower : GLOW_K.rimPower); }
    const ud = mat.userData;
    if (ud && ud.nsHaloHost) {
      if (k > 0 && !hint) {
        const h = muscleHalo(mat);
        if (h) { areaGlowInto(areaId, t, ud.nsHaloGain, muscleRim); h.material.uniforms.nsHaloColor.value.set(muscleRim[0], muscleRim[1], muscleRim[2]); if (!h.visible) { h.visible = true; haloState.shown++; } }
      } else if (ud.nsHalo && ud.nsHalo.visible) { ud.nsHalo.visible = false; haloState.shown--; }
    }
  }
  /** R558 (Message 2, "optogenetic glow"): a glowing muscle gets a soft additive HALO, a copy of its own surface pushed
   * out along its normals (MUSCLE_HALO: ownMm on your body, mirrorMm on the far mirror body, so both read on screen),
   * drawn from the inside (back faces) with alpha rising from 0 at the halo's outer edge toward the muscle, so the light
   * seems to spill a little past the muscle's outline. The muscle itself hides the halo's middle (depth test); no
   * depth write, no picking, built only when a muscle first glows and hidden again at rest. Display only. */
  const haloOk = typeof THREE.ShaderMaterial === 'function' && THREE.AdditiveBlending !== undefined;
  const haloState = { built: 0, shown: 0 };
  // R558 (Messages 22 and 53): the halo runs its muscle's neon flash too (the host's own nsCharge / nsSweep / nsFibre
  // uniforms and the shared clock): the same strike and flash, and at the peak the shell flares outward by
  // POWER_UP.haloBurst of its width, settling back with the flash.
  const HALO_PU = 'uniform vec4 nsClock;\nuniform vec4 nsCharge;\nuniform vec4 nsFibre;\nuniform vec2 nsSweep;\n' + powerUpGlsl('nsPowerUp') + '\n';
  const HALO_VS = 'uniform vec2 nsHaloShape;\n' + HALO_PU + '#ifdef NS_FIBRE_REST\nattribute vec3 nsRest;\n#endif\nvarying vec3 vNsN;\nvarying vec3 vNsV;\nvarying float vNsU;\nvoid main() {\n' +
    '  float flash = nsCharge.z > 0.5 ? nsPowerUpFlash( nsClock.x - nsCharge.x, nsCharge.y, nsClock.y ) : 0.0;\n' +
    `  vec3 p = position + normalize( normal ) * nsHaloShape.x * ( 1.0 + ${POWER_UP.haloBurst.toFixed(4)} * flash );\n` +
    '#ifdef NS_FIBRE_REST\n  vNsU = dot( nsRest, nsFibre.xyz ) * nsSweep.x + nsSweep.y;\n#else\n  vNsU = dot( position, nsFibre.xyz ) * nsSweep.x + nsSweep.y;\n#endif\n' +
    '  vec4 mv = modelViewMatrix * vec4( p, 1.0 );\n' +
    '  vNsN = normalize( normalMatrix * normal );\n  vNsV = - mv.xyz;\n  gl_Position = projectionMatrix * mv;\n}';
  const HALO_FS = 'uniform vec3 nsHaloColor;\nuniform vec2 nsHaloShape;\n' + HALO_PU + 'varying vec3 vNsN;\nvarying vec3 vNsV;\nvarying float vNsU;\nvoid main() {\n' +
    '  float f = clamp( abs( dot( normalize( vNsN ), normalize( vNsV ) ) ) * nsHaloShape.y, 0.0, 1.0 );\n  float a = f * f;\n' +
    '  vec4 pu = nsCharge.z > 0.5 ? nsPowerUp( nsClock.x - nsCharge.x, vNsU, nsCharge.y, nsClock.y ) : vec4( 1.0, 0.0, 1.0, 1.0 );\n' +
    '  vec3 c = nsHaloColor * pu.x;\n  c = mix( vec3( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) ), c, pu.z );\n' +
    '  c = mix( c, vec3( max( c.r, max( c.g, c.b ) ) ), clamp( pu.y, 0.0, 1.0 ) );\n' +
    '  gl_FragColor = vec4( c * a, a );\n}';
  function muscleHalo(mat) {
    const ud = mat.userData;
    if (!haloOk || !ud || !ud.nsHaloHost) return null;
    if (ud.nsHalo) return ud.nsHalo;
    const host = ud.nsHaloHost;
    // The shell offset is given in WORLD millimetres: the body meshes are in source mm, the CPU-skinned arm in metres.
    host.updateMatrixWorld(true);
    const sc = typeof host.matrixWorld.getMaxScaleOnAxis === 'function' ? host.matrixWorld.getMaxScaleOnAxis() : 0;
    const offset = sc > 0 && Number.isFinite(sc) ? ud.nsHaloMm / 1000 / sc : 0;
    const hm = keep(new THREE.ShaderMaterial({
      uniforms: { nsHaloColor: { value: new THREE.Vector3(0, 0, 0) }, nsHaloShape: { value: new THREE.Vector2(offset, MUSCLE_HALO.power) },
        // R558 (Message 22): the host muscle's own power-up state (shared objects, so they stay in step).
        nsClock: powerUpClock, nsCharge: ud.nsCharge || { value: new THREE.Vector4(-1e4, 0, 0, 0) }, nsFibre: ud.nsFibre || noFibre, nsSweep: ud.nsSweep || noSweep },
      vertexShader: HALO_VS, fragmentShader: HALO_FS, transparent: true, depthWrite: false, side: THREE.BackSide,
      blending: THREE.AdditiveBlending, toneMapped: false
    }));
    if (mat.defines && Object.prototype.hasOwnProperty.call(mat.defines, 'NS_FIBRE_REST')) hm.defines = { NS_FIBRE_REST: '' };
    const h = new THREE.Mesh(host.geometry, hm);
    h.name = `${host.name} (glow halo; display only)`;
    h.matrixAutoUpdate = false;
    h.raycast = () => {};
    h.frustumCulled = host.frustumCulled;
    h.renderOrder = (host.renderOrder || 0) + 0.01;
    h.visible = false;
    host.add(h);
    h.updateMatrixWorld(true);
    ud.nsHalo = h;
    haloState.built++;
    return h;
  }
  /** Mark a muscle mesh as able to carry a halo (its material keeps the host; mirror twins get the wider shell). */
  const haloHost = (mesh, mirrorTwin = false) => {
    if (haloOk && mesh && mesh.material && mesh.material.userData) {
      mesh.material.userData.nsHaloHost = mesh;
      mesh.material.userData.nsHaloMm = mirrorTwin ? MUSCLE_HALO.mirrorMm : MUSCLE_HALO.ownMm;
      mesh.material.userData.nsHaloGain = mirrorTwin ? MUSCLE_HALO.mirrorGain : MUSCLE_HALO.gain;
    }
    return mesh;
  };
  /** The left game arm's muscle (and its mirror twin) from its last drive and its owning area (else the left forearm
   * area, the palm turn of the Space key). */
  function shadeArmMuscle(m) {
    const t = Number.isFinite(m.lastT) ? m.lastT : baselineDrive, id = m.owner || ARM_FALLBACK_AREA, h = m.ownerHint === true;
    shadeMuscle(m.mat, t, id, h);
    if (m.mirror) shadeMuscle(m.mirror.material, t, id, h);
  }
  /** A body muscle (and its mirror and in-place twins) from its last drive and its owning area (else ns-colors
   * bodyPartArea of its part and side). */
  function shadeBodyMuscle(b) {
    const t = Number.isFinite(b.lastDrive) ? b.lastDrive : MUSCLE_REST_DRIVE, id = b.owner || b.fallbackArea || null, h = b.ownerHint === true;
    shadeMuscle(b.material, t, id, h);
    if (b.mirror) shadeMuscle(b.mirror.material, t, id, h);
    if (b.inPlace && b.kind === 'muscle') shadeMuscle(b.inPlace.material, t, id, h);
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
      // R558 (Message 22): the area's power-up starts when it begins to glow (its muscles join the same start).
      const cu = rec.material.userData && rec.material.userData.nsCharge;
      if (cu) {
        const on = glowIntensity(Number.isFinite(a) ? a : 0) > 0;
        const count = Number.isFinite(n) ? n : 0;
        if (on !== (rec.puOn === true)) {
          rec.puOn = on;
          const c = powerUpArea(rec.id);
          if (on) cu.value.x = powerUpJoin(rec.id);
          else c.offAt = powerUpNow();
          c.on = on;
          cu.value.z = on ? 1 : 0;
        } else if (on && Number.isFinite(rec.puCount) && count > rec.puCount) powerUpRecharge(rec.id, cu); // a second click while it glows
        rec.puCount = count;
      }
    }
    return changed;
  }

  // R558 (Message 6, REGION_HINT): faint hints on the areas whose action would bring a held joint back. Built lazily,
  // once per (area, action), from the area's own parts: the triangles whose centre the look rule gives to that action.
  const hintMeshes = new Map(); // `${regionId}/${actionId}` -> { meshes, whole, triangles, material }
  let hintKey = '';
  let hintShown = [];
  // Per VERTEX: 1 where the look rule gives the hinted action, else 0. A triangle on the sub-band's border then fades
  // across itself (vertex alpha), so the hint has a soft edge instead of a sawtooth of whole triangles.
  function hintVertexAlpha(rec, part, actionId) {
    const U = part.u, S = part.s, n = part.vertexCount || (U ? U.length : 0), a = new Float32Array(n);
    if (!U) return a;
    for (let v = 0; v < n; v++) {
      const act = NsBrain.regionActionAt(rec.region, U[v], S ? S[v] : U[v]);
      a[v] = act && act.id === actionId ? 1 : 0;
    }
    return a;
  }
  function buildHint(key, regionId, actionId, color) {
    const rec = regionById.get(regionId);
    if (!rec || !segmentation) return null;
    const material = keep(new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: REGION_HINT.opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    }));
    material.forceSinglePass = true;
    const c = Array.isArray(color) && color.length === 3 && color.every(Number.isFinite) ? color : REGION_HINT.color;
    const entry = { meshes: [], whole: false, triangles: 0, material };
    const parts = (rec.region.partIndices || []).map(pi => segmentation.parts[pi]).filter(q => q && q.faceCount > 0);
    let alphas = parts.map(q => (typeof actionId === 'string' ? hintVertexAlpha(rec, q, actionId) : new Float32Array(q.vertexCount || 0)));
    // Count the triangles that are fully inside the sub-band; too few (a sliver at the curved end of an area) or none:
    // light the whole area instead.
    let inside = 0;
    parts.forEach((q, i) => { const I = q.indices, A = alphas[i]; for (let t = 0; t + 2 < I.length; t += 3) if (A[I[t]] > 0 && A[I[t + 1]] > 0 && A[I[t + 2]] > 0) inside++; });
    if (inside < REGION_HINT.minTriangles) { alphas = parts.map(q => new Float32Array(q.vertexCount || q.positions.length / 3).fill(1)); entry.whole = true; }
    parts.forEach((q, i) => {
      const I = q.indices, A = alphas[i], keepTris = [];
      for (let t = 0; t + 2 < I.length; t += 3) if (A[I[t]] > 0 || A[I[t + 1]] > 0 || A[I[t + 2]] > 0) keepTris.push(I[t], I[t + 1], I[t + 2]);
      if (!keepTris.length) return;
      const geo = indexedGeometry(q.positions, new Uint32Array(keepTris));
      const col = new Float32Array(A.length * 4);
      for (let v = 0; v < A.length; v++) { col[4 * v] = c[0]; col[4 * v + 1] = c[1]; col[4 * v + 2] = c[2]; col[4 * v + 3] = A[v]; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      const mesh = new THREE.Mesh(geo, material);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      mesh.name = `motor region hint: ${regionId}${actionId ? ` / ${actionId}` : ''} (the opposing action; simulated)`;
      mesh.userData = { regionHint: true, regionId, actionId: actionId || null };
      mesh.renderOrder = RENDER_ORDER.region + REGION_HINT.renderOrderOffset;
      mesh.raycast = () => {}; // a hint is never picked: the area under it keeps its own picking
      mesh.visible = false;
      brainGroup.add(mesh);
      entry.meshes.push(mesh);
      entry.triangles += keepTris.length / 3;
    });
    hintMeshes.set(key, entry);
    return entry;
  }
  // R558 (Message 18, REGION_BORDER): with the per-fragment areas the hint is drawn by the area's own material: the
  // hinted action's sub-band of the strip coordinate (the same look rule, ns-brain regionActionAt), soft-edged in CSS
  // pixels, so it follows the drawn area exactly (no extra meshes, no additive overlap). Built once per (area, action).
  const hintBands = new Map(); // `${regionId}/${actionId}` -> { lo, hi, whole, triangles }
  function hintBand(rec, actionId) {
    const k = `${rec.id}/${actionId || ''}`;
    if (hintBands.has(k)) return hintBands.get(k);
    let lo = Infinity, hi = -Infinity;
    if (typeof actionId === 'string') {
      const N = 4096;
      for (let i = 0; i <= N; i++) {
        const s = i / N, act = NsBrain.regionActionAt(rec.region, s, s);
        if (act && (act.id === actionId || act.armActionId === actionId)) { if (s < lo) lo = s; if (s > hi) hi = s; }
      }
      if (lo <= hi) { lo -= 0.5 / N; hi += 0.5 / N; }
    }
    const whole = !(lo <= hi);
    if (whole) { lo = -1; hi = 2; }
    let triangles = 0;
    for (const m of [...rec.meshes, ...rec.fillMeshes]) {
      const a = m.geometry.getAttribute('nsS'), ix = m.geometry.index;
      if (!a) continue;
      const cnt = ix ? ix.count : a.count;
      for (let t = 0; t + 2 < cnt; t += 3) {
        const i0 = ix ? ix.getX(t) : t, i1 = ix ? ix.getX(t + 1) : t + 1, i2 = ix ? ix.getX(t + 2) : t + 2;
        const s0 = a.getX(i0), s1 = a.getX(i1), s2 = a.getX(i2);
        if (Math.max(s0, s1, s2) >= lo && Math.min(s0, s1, s2) <= hi) triangles++;
      }
    }
    const e = { lo, hi, whole, triangles };
    hintBands.set(k, e);
    return e;
  }
  function setBorderHints(list, keys) {
    const want = new Map(); // region id -> { lo, hi, color, keys }
    list.forEach((h, i) => {
      const rec = regionById.get(h.regionId);
      if (!rec || !(rec.material.userData && rec.material.userData.nsBorder)) return;
      const band = hintBand(rec, typeof h.actionId === 'string' ? h.actionId : null);
      const c = Array.isArray(h.color) && h.color.length === 3 && h.color.every(Number.isFinite) ? h.color : REGION_HINT.color;
      const w = want.get(rec.id);
      // Two hints on one area (rare): the span of both sub-bands, the first hint's colour.
      if (w) { w.lo = Math.min(w.lo, band.lo); w.hi = Math.max(w.hi, band.hi); if (!w.keys.includes(keys[i])) w.keys.push(keys[i]); }
      else want.set(rec.id, { lo: band.lo, hi: band.hi, color: c, keys: [keys[i]] });
    });
    hintShown = [];
    for (const rec of regions) {
      const u = rec.material.userData && rec.material.userData.nsBorder;
      if (!u) continue;
      const w = want.get(rec.id);
      if (!w) { u.nsHint.value.set(0, 0, 0, 0); continue; }
      const g = REGION_BORDER.hintGain * (REGION_HINT.opacity / 0.28);
      u.nsHint.value.set(w.lo, w.hi, 1, REGION_BORDER.hintAlpha);
      u.nsHintColor.value.set(w.color[0] * g, w.color[1] * g, w.color[2] * g);
      for (const k of w.keys) if (!hintShown.includes(k)) hintShown.push(k);
    }
    return hintShown.length;
  }
  /** R558: show exactly these hints ([{ regionId, actionId?, color? }], e.g. ns-actions latchView().hints); [] or null
   * hides them all. Cheap when unchanged (one key compare). Returns the number of hint areas shown. */
  function setRegionHints(hints) {
    const list = Array.isArray(hints) ? hints.filter(h => h && typeof h.regionId === 'string' && regionById.has(h.regionId)) : [];
    const keys = list.map(h => `${h.regionId}/${typeof h.actionId === 'string' ? h.actionId : ''}`);
    const key = Array.from(new Set(keys)).sort().join('|');
    if (key === hintKey) return hintShown.length;
    hintKey = key;
    if (regionBorder.applied !== false && regions.some(r => r.material.userData && r.material.userData.nsBorder)) return setBorderHints(list, keys);
    for (const e of hintMeshes.values()) for (const m of e.meshes) m.visible = false;
    hintShown = [];
    const seen = new Set();
    list.forEach((h, i) => {
      const k = keys[i];
      if (seen.has(k)) return;
      seen.add(k);
      const e = hintMeshes.get(k) || buildHint(k, h.regionId, typeof h.actionId === 'string' ? h.actionId : null, h.color);
      if (!e) return;
      for (const m of e.meshes) m.visible = true;
      hintShown.push(k);
    });
    return hintShown.length;
  }
  /** R558: read-only record of the shown hints (key, whole-area fallback, triangle count). */
  function regionHintState() {
    return { shown: hintShown.map(k => { const e = hintMeshes.get(k) || hintBands.get(k); return { key: k, whole: Boolean(e && e.whole), triangles: e ? e.triangles : 0 }; }), built: hintMeshes.size + hintBands.size, style: REGION_HINT, inPass: hintBands.size > 0 };
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

  let sideTieScratch = null; // R558: per-point screen distances of the side-label search (reused, no per-frame allocation)
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
        const mid = k === 'anterior' || k === 'posterior';
        const tie = !mid && L > 1e-6;
        if (tie && (!sideTieScratch || sideTieScratch.v.length < n)) sideTieScratch = { v: new Float64Array(n), u: new Float64Array(n) };
        for (let i = 0; i < P.length; i += 3) {
          // degenerate (the axis points at the camera): fall back to the extreme along the source axis
          const v = L > 1e-6 ? (scr(P[i], P[i + 1], P[i + 2], q), (q[0] - s0[0]) * dx / L + (q[1] - s0[1]) * dy / L)
            : P[i] * a[0] + P[i + 1] * a[1] + P[i + 2] * a[2];
          if (tie) { sideTieScratch.v[i / 3] = v; sideTieScratch.u[i / 3] = Math.abs((q[1] - s0[1]) * dx - (q[0] - s0[0]) * dy) / L; }
          if (v > bestV) { bestV = v; best = i; }
        }
        // R558 (issue hunt 1, item 10: "← Your left" and "Your right →" sat at different heights, up to 400 px apart in
        // the view from behind): a brain side is a long, nearly straight edge on screen, so its single furthest point
        // could lie anywhere along it, and the two sides picked points far apart. Among the side's points within
        // SIDE_LABEL_TIE of the furthest one (a share of the centre-to-side distance on screen), take the one nearest
        // the brain centre's own height across the axis: both side labels then sit level with the brain's middle, as a
        // pair, while each still sits on its side's outline. Display choice.
        if (tie && bestV > 0) {
          const floor = bestV * (1 - SIDE_LABEL_TIE);
          let bu = Infinity;
          for (let j = 0; j < n; j++) if (sideTieScratch.v[j] >= floor && sideTieScratch.u[j] < bu) { bu = sideTieScratch.u[j]; best = 3 * j; }
        }
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
    // R558 (performance; user Messages 42, 48 and 50): only what changed is written. While an area's activity rose or
    // fell, its number changed on every frame, and every such frame used to empty and fill all the rows, the caveats and
    // the "More detail" text again and made the browser lay the page out anew for the arrows and labels (the cards'
    // boxes are read again when the panel may have changed size). Now `grew` says that something that can change the
    // panel's SIZE was written; the activity's number (same count of characters), colour and meter mark cannot, and
    // they are told apart from it by the HUD watcher too (relevantHudRecord, infoQuietTarget).
    let grew = false;
    const put = (e, t) => { if (e.textContent !== t) { e.textContent = t; grew = true; } const h = t === ''; if (e.hidden !== h) { e.hidden = h; grew = true; } };
    const hide = (e, h) => { if (e.hidden !== h) { e.hidden = h; grew = true; } };
    const attr = (k, v) => { if (info.panel.getAttribute(k) !== v) { info.panel.setAttribute(k, v); grew = true; } };
    attr('data-mode', c.mode);
    attr('data-left-arm', c.leftArm ? 'true' : 'false');
    put(info.heading, c.heading);
    put(info.title, c.title);
    put(info.tag, c.tag);
    put(info.viewed, c.viewed);
    if (c.activity) {
      const was = info.activity.textContent, t = c.activity.text;
      if (was !== t) {
        const g = grew;
        put(info.activity, t);
        if (was.length === t.length && was !== '') grew = g; // the same count of characters: the row keeps its size
      }
      if (info.swatch.style && info.swatchCss !== c.activity.css) { info.swatchCss = c.activity.css; info.swatch.style.background = c.activity.css; }
      if (info.meter.style) { const mb = c.activity.meter || legendGradientCss(9); if (info.meterBg !== mb) { info.meterBg = mb; info.meter.style.background = mb; } }
      hide(info.actRow, false);
      hide(info.meter, false);
      if (info.meterMark.style) { const left = `${(c.activity.value * 100).toFixed(1)}%`; if (info.markLeft !== left) { info.markLeft = left; info.meterMark.style.left = left; } }
    } else { put(info.activity, ''); hide(info.actRow, true); hide(info.meter, true); }
    put(info.activations, c.activations);
    const rowsSig = JSON.stringify(c.rows);
    if (rowsSig !== info.rowsSig) {
      info.rowsSig = rowsSig; grew = true;
      while (info.rows.firstChild) info.rows.removeChild(info.rows.firstChild);
      for (const [k, v] of c.rows) {
        const slug = ROW_SLUG[k] || k.toLowerCase().split(/[^a-z]+/)[0] || 'row';
        el('dt', `ns-infopanel-key-${slug}`, info.rows).textContent = k;
        el('dd', `ns-infopanel-row-${slug}`, info.rows).textContent = v;
      }
    }
    hide(info.rows, c.rows.length === 0);
    put(info.plain, c.plain);
    // The movement list: rebuilt only when a label, the current mark or an "already there" changes.
    const movesSig = JSON.stringify([c.moves, c.movesAtEnd, c.movesCurrent, c.movesBack]);
    if (movesSig !== info.movesSig) {
      info.movesSig = movesSig; grew = true;
      while (info.moves.firstChild) info.moves.removeChild(info.moves.firstChild);
      for (const m of c.moves) {
        const li = el('li', 'ns-infopanel-move', info.moves);
        li.setAttribute('data-current', m.current ? 'true' : 'false');
        li.setAttribute('data-at-end', m.atEnd ? 'true' : 'false');
        li.setAttribute('data-back', m.back ? 'true' : 'false');
        el('span', 'ns-keycap ns-infopanel-move-key', li).textContent = String(m.n);
        const words = el('span', 'ns-infopanel-move-label', li);
        words.textContent = m.label;
        // One note per line: nothing would move; else the press would only bring the part back; else it is the one shown.
        const note = m.atEnd ? c.movesAtEnd : m.back ? c.movesBack : m.current ? c.movesCurrent : '';
        if (note) el('span', 'ns-infopanel-move-note', words).textContent = note;
      }
    }
    put(info.movesHeading, c.movesHeading);
    hide(info.moves, c.moves.length === 0);
    put(info.explanation, c.explanation);
    put(info.simulated, c.simulated);
    put(info.known, c.known);
    put(info.regionCaveat, c.regionCaveat);
    const cavSig = JSON.stringify(c.caveats);
    if (cavSig !== info.cavSig) {
      info.cavSig = cavSig; grew = true;
      while (info.caveats.firstChild) info.caveats.removeChild(info.caveats.firstChild);
      for (const t of c.caveats) el('li', '', info.caveats).textContent = t;
    }
    hide(info.caveats, c.caveats.length === 0);
    put(info.citations, c.citations ? `${NsText.INFO.sourcesPrefix}${c.citations}` : '');
    // Round 3 (D3): the technical layer, collapsed again whenever the subject changes.
    const moreSig = c.more ? JSON.stringify(c.more) : '';
    if (moreSig !== info.moreSig) {
      info.moreSig = moreSig; grew = true;
      while (info.moreBody.firstChild) info.moreBody.removeChild(info.moreBody.firstChild);
      if (c.more) {
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
      }
    }
    if (c.more) {
      put(info.moreSummary, c.more.summary);
      if (info.moreKey !== c.key) {
        // R558 (the R key): in the "more" state the player asked for More detail, so it stays open from area to area.
        const root = typeof info.panel.closest === 'function' ? info.panel.closest('.ns-app') : null;
        const open = Boolean(root && typeof root.getAttribute === 'function' && root.getAttribute('data-ns-read') === 'more');
        if (info.more.open !== open) { info.more.open = open; grew = true; }
        info.moreKey = c.key;
      }
      hide(info.more, false);
    } else {
      hide(info.more, true);
      if (info.more.open) { info.more.open = false; grew = true; }
      info.moreKey = null;
    }
    if (info.panel.hidden) { info.panel.hidden = false; hudReadIn = 0; grew = true; } // R3-scene: re-measure the obstacles now
    // R4-scene: the panel's size may change with its text: re-read the obstacles in this same frame
    if (grew) { info.grewN = (info.grewN | 0) + 1; overlayDirty = true; hudDirty = true; }
    return true;
  }

  /* ---------------------------------------------------------------- U2b-scene: full body and face layer */

  const entryList = entries => (entries instanceof Map ? [...entries.values()] : Array.isArray(entries) ? entries : entries && Array.isArray(entries.assets) ? entries.assets : []);
  const meshOf = (meshesById, id) => (meshesById instanceof Map ? meshesById.get(id) : meshesById ? meshesById[id] : null);

  /** R558 (Message 18, "easily differentiate each ... muscle node"): which muscles touch (they share a cell of
   * MUSCLE_TONE_CONTACT.cellMm in the drawn rest geometry; every `stride`-th vertex sampled; contact weight = shared
   * cells) -> ns-colors assignMuscleTones (side-free keys: a left / right pair is one node, so both sides share a tone)
   * -> every muscle's base colour; then every muscle (your body, its twins, the left game arm) is shaded again. Once,
   * at setBody. A display choice: the tones do not stand for any tissue property. */
  const MUSCLE_TONE_CONTACT = Object.freeze({ cellMm: 8, stride: 2 });
  function assignBodyMuscleTones() {
    const t0 = nowMs();
    const recs = body.filter(b => b.kind === 'muscle');
    const keys = recs.map(b => muscleToneKeyOf(b.id));
    const inv = 1 / MUSCLE_TONE_CONTACT.cellMm, cells = new Map(), pairs = new Map();
    recs.forEach((b, i) => {
      const g = b.mesh.userData.nsFullGeometry || b.mesh.geometry, p = g && g.attributes && g.attributes.position ? g.attributes.position.array : null;
      if (!p) return;
      for (let v = 0; v + 2 < p.length; v += 3 * MUSCLE_TONE_CONTACT.stride) {
        const c = (Math.floor(p[v] * inv) + 4096) * 67108864 + (Math.floor(p[v + 1] * inv) + 4096) * 8192 + (Math.floor(p[v + 2] * inv) + 4096);
        const list = cells.get(c);
        if (!list) cells.set(c, [i]); else if (list[list.length - 1] !== i) list.push(i);
      }
    });
    for (const list of cells.values()) {
      if (list.length < 2) continue;
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
        const ka = keys[list[a]], kb = keys[list[b]];
        if (ka === kb) continue;
        const pk = ka < kb ? `${ka}\u0000${kb}` : `${kb}\u0000${ka}`;
        pairs.set(pk, (pairs.get(pk) || 0) + 1);
      }
    }
    const contacts = new Map();
    const add = (a, b, w) => { let m = contacts.get(a); if (!m) contacts.set(a, (m = new Map())); m.set(b, (m.get(b) || 0) + w); };
    for (const [pk, w] of pairs) { const [a, b] = pk.split('\u0000'); add(a, b, w); add(b, a, w); }
    muscleTones.byKey = assignMuscleTones(keys, contacts);
    let worst = Infinity, worstPair = null;
    for (const [pk, w] of pairs) {
      if (w < 4) continue; // a real contact, not a corner touch
      const [a, b] = pk.split('\u0000'), d = muscleToneDistanceOf(a, b);
      if (d < worst) { worst = d; worstPair = [a, b, w]; }
    }
    muscleTones.contacts = pairs.size; muscleTones.keys = new Set(keys).size;
    muscleTones.worst = Number.isFinite(worst) ? { distance: Math.round(worst * 1000) / 1000, pair: worstPair } : null;
    muscleTones.ms = Math.round(nowMs() - t0);
    for (const b of recs) {
      setMuscleBase(b.material, b.id);
      if (b.mirror) setMuscleBase(b.mirror.material, b.id);
      if (b.inPlace) setMuscleBase(b.inPlace.material, b.id);
      shadeBodyMuscle(b);
    }
    for (const m of muscles) {
      setMuscleBase(m.mat, m.id);
      if (m.mirror) setMuscleBase(m.mirror.material, m.id);
      shadeArmMuscle(m);
    }
  }
  const muscleToneDistanceOf = (a, b) => {
    const t = muscleTones.byKey;
    return t && t.has(a) && t.has(b) ? NsColors.muscleToneDistance(t.get(a), t.get(b)) : NaN;
  };

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
      // R558 (Message 30): a finger or toe phalanx is drawn from its rounded display copy (boneTipDisplay; documented
      // derivative, the packet arrays are not changed).
      const tipName = kind === 'bone' ? String(entry.embedded_source_name || (Array.isArray(entry.matched_concept_names) && entry.matched_concept_names[0]) || entry.label || entry.requested_structure || '') : '';
      const tipPos = /phalan/i.test(tipName) ? boneTipDisplay(m.positions, m.indices, { distal: /distal phalanx/i.test(tipName) }) : null;
      if (tipPos) boneTips.meshes++;
      const geo = indexedGeometry(tipPos || (m.positions instanceof Float32Array ? m.positions : Float32Array.from(m.positions)), m.indices instanceof Uint32Array ? m.indices : Uint32Array.from(m.indices));
      geo.computeVertexNormals();
      weldGeometryNormals(geo); // R558 (R33): own body, its in-place head and the mirror twin all draw this geometry
      hatchAttr(geo, geo.attributes.position.array, kind === 'muscle' ? 'muscle' : 'bone', id); // R558 (Messages 24, 29): ink frame
      if (typeof geo.computeBoundingSphere === 'function') geo.computeBoundingSphere();
      let material;
      const trunk = !face && (part === 'torso' || part === 'neck');
      if (kind === 'muscle') {
        material = keep(new THREE.MeshStandardMaterial({ color: MATERIAL.muscleBase, roughness: MUSCLE_LOOK.roughness, metalness: 0 }));
        tendonAttr(geo); // R558 (Message 18): tendon ends, written by setBodyLift
        setMuscleBase(material, id);
        material.userData.nsFibre = fibreUniform(geo.attributes.position.array, id);
        material.userData.nsSweep = sweepUniform(geo.attributes.position.array, material.userData.nsFibre); // R558 (Message 22)
        if (face) { material.transparent = true; material.opacity = FACE_LAYER.muscleOpacity; material.depthWrite = false; }
        else if (trunk) torsoPatch(material);
        if (!face) overBrainPatch(material, part === 'legs');
        glowRimPatch(material); // R5-scene (D17)
        muscleLookPatch(material); // R558 (Message 18)
        powerUpPatch(material, 'muscle'); // R558 (Message 22): the power-up charge
        comicPatch(material, 'muscle'); // R558 (Messages 25 to 29): bands, rim, highlight shapes, ink
        shadeMuscle(material, MUSCLE_REST_DRIVE);
      } else material = face ? faceBoneMaterial : trunk ? torsoBoneMaterial : part === 'legs' ? legBoneMaterial : bodyBoneMaterial;
      const eyePart = kind === 'bone' ? eyePartOf(entry) : null; // R558 (builder FA): sclera / iris / lens
      const mesh = kind === 'muscle' ? haloHost(new THREE.Mesh(geo, material)) : new THREE.Mesh(geo, material); // R558: halo
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
      // R558 (Message 2): the area whose colour this muscle shows when no area claims it (ns-colors bodyPartArea).
      if (kind === 'muscle') { rec.owner = null; rec.fallbackArea = bodyPartArea(part, rec.side); }
      // R5-scene (D19): the mirror twin (same geometry and pose matrix, opaque, head and face in place).
      {
        const tm = kind === 'muscle' ? setMuscleBase(mirrorMuscleMaterial(), id) : eyePart ? eyeMaterial(eyePart, true) : mirrorBoneMaterial;
        if (kind === 'muscle') { tm.userData.nsFibre = material.userData.nsFibre; tm.userData.nsSweep = material.userData.nsSweep; }
        if (kind === 'muscle') shadeMuscle(tm, MUSCLE_REST_DRIVE);
        const tw = kind === 'muscle' ? haloHost(new THREE.Mesh(geo, tm), true) : new THREE.Mesh(geo, tm);
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
        let im = eyePart ? eyeMaterial(eyePart, false) : bodyBoneMaterial;
        if (kind === 'muscle') { im = setMuscleBase(comicPatch(powerUpPatch(muscleLookPatch(glowRimPatch(overBrainPatch(keep(new THREE.MeshStandardMaterial({ color: MATERIAL.muscleBase, roughness: MUSCLE_LOOK.roughness, metalness: 0 }))))), 'muscle'), 'muscle'), id); im.userData.nsFibre = material.userData.nsFibre; im.userData.nsSweep = material.userData.nsSweep; shadeMuscle(im, MUSCLE_REST_DRIVE); }
        const ip = kind === 'muscle' ? haloHost(new THREE.Mesh(geo, im)) : new THREE.Mesh(geo, im);
        ip.name = `${bodyMeshName(entry, id)} [in place: third person]`;
        ip.matrixAutoUpdate = false;
        ip.visible = camState.headInPlace;
        ip.renderOrder = BODY_ORDER.torso;
        ip.userData = { elementId: id, bodyPart: 'face', anatomicalPart: part, kind, inPlace: true };
        bodyGroup.add(ip);
        rec.inPlace = ip;
        mesh.userData.nsInPlaceTwin = ip;
      }
      // R558 (Message 20): outline codes (a coarse group from the part and side until setOutlineSegments brings the rig's).
      {
        const g = outlineGroupForPart(part, rec.side);
        if (!face) outline.register(rec.mesh, { group: g });
        if (rec.mirror) outline.register(rec.mirror, { group: g, mirror: true });
        if (rec.inPlace) outline.register(rec.inPlace, { group: g });
      }
      body.push(rec);
      bodyById.set(id, rec);
      fastPick(rec.mesh); if (rec.mirror) fastPick(rec.mirror); if (rec.inPlace) fastPick(rec.inPlace); // R558: rigid body meshes
    }
    assignBodyMuscleTones(); // R558 (Message 18): neighbouring muscles get clearly different natural tones
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
   * Full scope/caveats come from the same pinned local catalogue as ns-body.
   * R558 (the Body Worlds stack): the selection is every drawn muscle the one stack rule (ns-body bodyStackLevel) puts
   * at the outer or the intermediate level AND the summary lists; the summary's offsets are the largest per-vertex
   * displacement of the full lift (target). What is actually drawn is set by setBodyLift; until a muscle's lifted
   * geometry is registered there its status stays 'selected-target' and its applied offset 0. */
  let bodyLayerInfo = null, bodyLayerSummary = null;
  const bodyLift = new Map(), bodyLiftGeos = new Map(); // element id -> lift record; full geometry -> the same record
  let bodyLiftAmount = 0, bodyLiftInfo = null;
  function writeBodyWorlds(b) {
    const sum = bodyLayerSummary, q = regionalLayerQualification(b.id), level = bodyStackLevel(b.id);
    const L = bodyLift.get(b.id) || null;
    const isSelected = (level === 'outer' || level === 'intermediate') && Boolean(L || (sum && sum.selected.has(b.id)));
    const listed = sum && Number.isFinite(sum.off[b.id]) ? sum.off[b.id] : 0;
    const targetOffsetMm = !isSelected ? 0 : L ? Math.round(L.maxMm * 10) / 10 : listed;
    const bw = Object.freeze({ ...regionalLayerMetadata(b.id, isSelected), stackLevel: level, displaySelected: isSelected,
      displayStatus: !isSelected ? (L ? (bodyLiftAmount > 0 ? 'filled' : 'off') : 'not-selected') : !L ? 'selected-target' : bodyLiftAmount > 0 ? 'applied' : 'off',
      offsetMm: L ? Math.round(L.maxMm * bodyLiftAmount * 10) / 10 : 0, targetOffsetMm,
      anchoredVertices: L ? L.still : 0,
      offsetMeaning: L ? (isSelected ? 'largest-vertex-displacement' : 'largest-vertex-displacement-fill-only') : 'target-not-applied', offsetFrame: 'drawn-rest-mm',
      amount: L ? bodyLiftAmount : null,
      targetAmount: sum && Number.isFinite(sum.targetAmount) ? sum.targetAmount : null });
    b.mesh.userData.bodyWorlds = bw;
    if (b.mirror) b.mirror.userData.bodyWorlds = bw;
    if (b.inPlace) b.inPlace.userData.bodyWorlds = bw;
    return { q, level, isSelected };
  }
  function setBodyLayers(summary) {
    if (summary && summary.regionalCatalogueSha256 !== REGIONAL_LAYER_PROVENANCE.classificationDataSha256) {
      fail('scene_input', 'body layer summary catalogue identity does not match the scene');
    }
    bodyLayerSummary = {
      selected: new Set(summary && Array.isArray(summary.displaySelected) ? summary.displaySelected : []),
      off: summary && summary.offsetMm && typeof summary.offsetMm === 'object' ? summary.offsetMm : {},
      targetAmount: summary ? summary.targetAmount : null
    };
    const n = { superficial: 0, intermediate_deep: 0, unclassified: 0, displaySelected: 0, outer: 0, intermediate: 0 };
    for (const b of body) {
      if (b.kind !== 'muscle') continue;
      const r = writeBodyWorlds(b);
      n[r.q.layer]++;
      if (r.isSelected) { n.displaySelected++; n[r.level]++; }
    }
    // Compatibility count only: scoped intermediate/deeper relations, not all unlifted meshes.
    bodyLayerInfo = { ...n, deep: n.intermediate_deep };
    return { ...bodyLayerInfo };
  }

  /** R558: the Body Worlds stack on the body. The own body, its in-place head twin and the mirror body draw the SAME
   * geometry objects, so one write moves all of them together.
   * liftedById: Map (or plain object) element id -> Float32Array, the FULL-lift vertex positions of one lifted muscle in
   * the drawn rest frame (ns-body bodyStackLiftedPositions: a per-vertex lift, zero at the anchored ends, so those
   * vertices are the same numbers as in the unlifted geometry); each id is registered once, later calls pass null and
   * only change the amount. amount 0..1 blends unlifted -> full lift. Amount 0 copies the unlifted positions and
   * normals back number for number: exactly the unlifted body.
   * Cost: the vertex buffers of the lifted muscles are rewritten only when the amount CHANGES (the short ease when the
   * setting is switched); a steady amount costs nothing per frame. Normals: the unlifted and the full-lift normals are
   * each computed once (same area weighting and seam weld as every body mesh); in between they are blended and
   * renormalised, exact at 0 and at 1. Level-of-detail copies of a lifted muscle are index-only over the same buffers
   * (lodGeometry), and its bounding sphere is grown once to hold the full lift, so culling, the mirror envelope and
   * picking stay right at every amount. Picking: pickBufferWritten.
   * A display choice on licensed anatomy; the anchor rule lives in ns-body. Fails closed (scene_input) on an id that
   * the stack rule does not lift or on geometry that does not match the drawn mesh.
   * Returns { lifted, registered, missing, amount, maxLiftMm, vertices }. */
  function applyBodyLift(L, a) {
    if (L.applied === a) return false;
    const p = L.pos.array, n = L.nor.array, r = L.rest, f = L.full, rn = L.restN, fn = L.fullN;
    if (a <= 0) { p.set(r); n.set(rn); }
    else if (a >= 1) { p.set(f); n.set(fn); }
    else {
      const b = 1 - a;
      for (let i = 0; i < p.length; i++) p[i] = r[i] + a * (f[i] - r[i]);
      for (let i = 0; i < n.length; i += 3) {
        const x = b * rn[i] + a * fn[i], y = b * rn[i + 1] + a * fn[i + 1], z = b * rn[i + 2] + a * fn[i + 2], l = Math.hypot(x, y, z);
        if (l > 1e-6) { n[i] = x / l; n[i + 1] = y / l; n[i + 2] = z / l; } else { n[i] = rn[i]; n[i + 1] = rn[i + 1]; n[i + 2] = rn[i + 2]; }
      }
    }
    L.pos.needsUpdate = true; L.nor.needsUpdate = true;
    L.applied = a;
    pickBufferWritten(p);
    lodTouch(L.geo); // R558: the body's coarser copies follow
    // R558: a skinned right-hand muscle keeps its pose: the lift rides on the skin (setBodySkin).
    const sk = bodySkin.get(L.id);
    if (sk && sk.skinned) skinOne(sk);
    return true;
  }
  function setBodyLift(liftedById = null, amount = 1) {
    const a = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
    let registered = 0, missing = 0, relod = false;
    if (liftedById) {
      const list = liftedById instanceof Map ? [...liftedById] : Object.keys(liftedById).map(id => [id, liftedById[id]]);
      for (const [id, full] of list) {
        const b = bodyById.get(id);
        if (!b) { missing++; continue; } // a lifted id the scene does not draw (skipped at setBody)
        const level = bodyStackLevel(id);
        // Round 3: every muscle may take the display fill; only the levels the stack rule lifts may move further.
        if (b.kind !== 'muscle') fail('scene_input', 'body lift is only for muscles');
        const geo = b.mesh.userData.nsFullGeometry || b.mesh.geometry;
        const pos = geo && geo.attributes ? geo.attributes.position : null, nor = geo && geo.attributes ? geo.attributes.normal : null;
        const had = bodyLift.get(id);
        if (had) {
          if (had.full !== full) fail('scene_input', 'a body muscle takes its lifted geometry once');
          continue;
        }
        if (!pos || !nor || !geo.index || !(pos.array instanceof Float32Array) || !(nor.array instanceof Float32Array) || !(full instanceof Float32Array)
          || full.length !== pos.array.length || nor.array.length !== pos.array.length || full === pos.array) {
          fail('scene_input', 'lifted body geometry does not match the drawn mesh');
        }
        const rest = pos.array; // the caller's baked array: kept as the unlifted reference, never written again
        let max2 = 0, still = 0;
        for (let i = 0; i < rest.length; i += 3) {
          const dx = full[i] - rest[i], dy = full[i + 1] - rest[i + 1], dz = full[i + 2] - rest[i + 2], d2 = dx * dx + dy * dy + dz * dz;
          if (!(d2 >= 0) || d2 === Infinity) fail('scene_input', 'lifted body geometry must be finite');
          if (d2 === 0) still++; else if (d2 > max2) max2 = d2;
        }
        if (Math.sqrt(max2) > stackCapMm(level, id)) fail('scene_input', 'body lift moves a muscle further than the stack rule allows');
        // One drawn buffer per muscle: swap the ARRAY (same length), keep the attribute OBJECT (level-of-detail copies
        // and the mirror twin keep sharing it).
        pos.array = new Float32Array(rest);
        const L = { id, level, geo, pos, nor, rest, full, restN: new Float32Array(nor.array),
          fullN: computeNormals(full, geo.index.array, undefined, { groups: null }), maxMm: Math.sqrt(max2), still, vertices: rest.length / 3, applied: 0 };
        pos.needsUpdate = true;
        // Grow the bounding volumes in place (shared objects) so they hold every amount of the lift.
        if (!geo.boundingSphere && typeof geo.computeBoundingSphere === 'function') geo.computeBoundingSphere();
        if (geo.boundingSphere) {
          const c = geo.boundingSphere.center;
          let r2 = geo.boundingSphere.radius * geo.boundingSphere.radius;
          for (let i = 0; i < full.length; i += 3) {
            const d2 = (full[i] - c.x) ** 2 + (full[i + 1] - c.y) ** 2 + (full[i + 2] - c.z) ** 2;
            if (d2 > r2) r2 = d2;
          }
          geo.boundingSphere.radius = Math.sqrt(r2);
        }
        if (geo.boundingBox) { const bp = new THREE.Vector3(); for (let i = 0; i < full.length; i += 3) geo.boundingBox.expandByPoint(bp.set(full[i], full[i + 1], full[i + 2])); }
        bodyLift.set(id, L);
        bodyLiftGeos.set(geo, L);
        writeTendon(geo, rest, full, id); // R558 (Message 18): tendon white on the anchored ends
        // Level-of-detail copies built before the lift hold their own (unlifted) vertices: drop them; lodGeometry now
        // makes index-only copies over the shared buffers.
        const byCell = lodOf.get(geo);
        if (byCell) {
          for (const g of byCell.values()) {
            if (g === geo) continue;
            const t = g.userData && g.userData.nsLodStat;
            if (t && t.stat) { t.stat[0] -= t.full; t.stat[1] -= t.lod; }
            if (typeof g.dispose === 'function') g.dispose();
          }
          lodOf.delete(geo); lodSyncs.delete(geo);
          relod = true;
        }
        pickBufferWritten(pos.array);
        registered++;
      }
    }
    let maxLiftMm = 0, vertices = 0;
    for (const L of bodyLift.values()) { applyBodyLift(L, a); if (L.maxMm > maxLiftMm) maxLiftMm = L.maxMm; vertices += L.vertices; }
    const amountChanged = a !== bodyLiftAmount;
    bodyLiftAmount = a;
    if (registered || amountChanged) for (const L of bodyLift.values()) writeBodyWorlds(bodyById.get(L.id));
    if (relod && lodApplied) setLod(QUALITY_LEVELS[qState.level].lod, lodApplied);
    let outer = 0, intermediate = 0, fillOnly = 0;
    for (const L of bodyLift.values()) { if (L.level === 'outer') outer++; else if (L.level === 'intermediate') intermediate++; else fillOnly++; }
    bodyLiftInfo = { lifted: outer + intermediate, filled: bodyLift.size, fillOnly, outer, intermediate, missing: (bodyLiftInfo ? bodyLiftInfo.missing : 0) + missing, amount: a,
      maxLiftMm: Math.round(maxLiftMm * 10) / 10, vertices };
    return { ...bodyLiftInfo, registered };
  }

  /** R558 (Message 20, ns-outline): the limb group of each body mesh from the rig's segment membership (ns-body
   * buildBodyRig meshSegment: { id: { segment, blend } }); a muscle spanning a joint takes the segment with most of its
   * weight. Meshes the rig does not list keep their coarse group. Returns how many meshes were set. */
  function setOutlineSegments(meshSegment) {
    if (!meshSegment || typeof meshSegment !== 'object') return 0;
    let n = 0;
    for (const b of body) {
      const info = meshSegment[b.id];
      if (!info) continue;
      const g = outlineGroupForBlend(info.blend, info.segment);
      if (!(g > 0)) continue;
      if (!b.face) outline.setGroup(b.mesh, g);
      if (b.mirror) outline.setGroup(b.mirror, g);
      if (b.inPlace) outline.setGroup(b.inPlace, g);
      n++;
    }
    return n;
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
  /* R558 (Messages 14 / 15: each finger of the right hand on its own, as on the left game hand). The long finger and
   * thumb muscles and the hand's own muscle sets are ONE mesh across several digits (and across the wrist), so a single
   * rigid matrix cannot follow one bent finger next to a straight one: the tendon of the bent finger would stick out.
   * These meshes are skinned per vertex instead, with the same two-influence weights that baked the start posture (ns-body
   * bodySkinWeights on the source vertices), exactly as the left game arm's muscles are skinned (ns-rig skinApply).
   * setBodySkin(records, bakedSegments) registers them once: records Map(element id -> { src (source positions), i0, i1,
   * w0, w1 }), bakedSegments the bake's Map(segment -> source->drawn matrix). updateBodySkin(segments) poses them from
   * poseBodyDetailed().segments (source->drawn) on top of the rigid matrix updateBody has just set (the vertices are
   * written in the mesh's own frame, so culling, picking, the mirror twin and the in-place head share one buffer as with
   * the lift); updateBodySkin(null) puts the rigid rest geometry back. The Body Worlds lift rides on the skin: the lift's
   * per-vertex offset is turned with the vertex's blended rotation. Written only when called (ns-app calls it when the
   * right hand or wrist is away from the start posture and the pose changed). Display choice on licensed anatomy. */
  const bodySkin = new Map(), bodySkinGeos = new Map();
  let bodySkinOn = false, bodySkinSegs = null, bodySkinBaked = null, bodySkinWrites = 0;
  const rigidInv16 = (m, o) => { // inverse of a rigid (rotation + translation) column-major 4x4
    o[0] = m[0]; o[1] = m[4]; o[2] = m[8]; o[4] = m[1]; o[5] = m[5]; o[6] = m[9]; o[8] = m[2]; o[9] = m[6]; o[10] = m[10];
    o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]); o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]); o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
    o[3] = 0; o[7] = 0; o[11] = 0; o[15] = 1; return o;
  };
  const mul16 = (a, b, o) => { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[4 * c + r] = a[r] * b[4 * c] + a[4 + r] * b[4 * c + 1] + a[8 + r] * b[4 * c + 2] + a[12 + r] * b[4 * c + 3]; return o; };
  function setBodySkin(records, bakedSegments) {
    if (!(records instanceof Map) || !(bakedSegments instanceof Map)) fail('scene_input', 'setBodySkin needs Map records and the baked segment matrices');
    let registered = 0, missing = 0;
    bodySkinBaked = bakedSegments;
    for (const [id, r] of records) {
      const b = bodyById.get(id);
      if (!b || b.kind !== 'muscle') { missing++; continue; }
      const geo = b.mesh.userData.nsFullGeometry || b.mesh.geometry;
      const pos = geo && geo.attributes ? geo.attributes.position : null, nor = geo && geo.attributes ? geo.attributes.normal : null;
      const n = pos ? pos.array.length / 3 : 0;
      if (!pos || !nor || !(r.src instanceof Float32Array) || r.src.length !== pos.array.length || !r.i0 || r.i0.length !== n || r.i1.length !== n || r.w0.length !== n || r.w1.length !== n) {
        fail('scene_input', 'hand skin record does not match the drawn mesh');
      }
      if (bodySkin.has(id)) continue;
      const lift = bodyLift.get(id) || null;
      // R558 (ns-body R_FOREARM_TWIST): a right forearm muscle's twisted ulna influence carries tf and the twist frame.
      if (r.tf && (!(r.tf instanceof Float32Array) || r.tf.length !== n || !r.twist || !r.twist.axis || !r.twist.point)) fail('scene_input', 'forearm twist record does not match the drawn mesh');
      const rec = { id, b, geo, pos, nor, src: r.src, i0: r.i0, i1: r.i1, w0: r.w0, w1: r.w1, lift, tf: r.tf || null, twist: r.tf ? r.twist : null,
        rest: lift ? lift.rest : new Float32Array(pos.array), restN: lift ? null : new Float32Array(nor.array), skinned: false };
      if (!lift) pos.array = new Float32Array(rec.rest); // one drawn buffer per muscle (attribute object kept; see the lift)
      // The fingers and the hand move up to about a hand length against the mesh's rigid frame: grow the shared bounding
      // sphere once so culling stays right at every pose.
      if (!geo.boundingSphere && typeof geo.computeBoundingSphere === 'function') geo.computeBoundingSphere();
      if (geo.boundingSphere) geo.boundingSphere.radius += 220;
      if (geo.boundingBox) geo.boundingBox.expandByScalar(220);
      // Coarser copies built before now hold their own vertices: drop them (lodGeometry makes index-only ones for these).
      const byCell = lodOf.get(geo);
      if (byCell) { for (const g of byCell.values()) if (g !== geo && typeof g.dispose === 'function') g.dispose(); lodOf.delete(geo); lodSyncs.delete(geo); }
      bodySkin.set(id, rec);
      const used = new Set();
      for (let v = 0; v < n; v++) { used.add(r.i0[v]); used.add(r.i1[v]); }
      if (rec.tf) { used.add(SKIN_RF); used.add(SKIN_RR); } // the twisted frames follow the ulna and the radius
      rec.used = Uint8Array.from(used); // the bones this muscle's vertices hang from (skinOne, skinPoseSame)
      if (!lift) bodySkinGeos.set(geo, rec);
      pos.needsUpdate = true;
      pickBufferWritten(pos.array);
      registered++;
    }
    if (registered && lodApplied) setLod(QUALITY_LEVELS[qState.level].lod, lodApplied);
    return { registered, missing, skinned: bodySkin.size };
  }
  /** The unskinned drawn geometry of one record (rest, or the lift blend at its current amount) into out arrays. */
  function skinBase(rec, P, N) {
    const L = rec.lift;
    if (!L) { P.set(rec.rest); N.set(rec.restN); return; }
    const a = L.applied || 0, b = 1 - a, r = L.rest, f = L.full, rn = L.restN, fn = L.fullN;
    for (let i = 0; i < P.length; i++) P[i] = r[i] + a * (f[i] - r[i]);
    for (let i = 0; i < N.length; i += 3) {
      const x = b * rn[i] + a * fn[i], y = b * rn[i + 1] + a * fn[i + 1], z = b * rn[i + 2] + a * fn[i + 2], l = Math.hypot(x, y, z) || 1;
      N[i] = x / l; N[i + 1] = y / l; N[i + 2] = z / l;
    }
  }
  const skinMeshInv = new Float64Array(16), skinRefInv = new Float64Array(16), skinRelTmp = new Float64Array(16);
  let skinBakedInv = null; // skinBakedInv[segment index]: drawn rest -> source (inverse of the bake's segment matrix)
  // R558 (ns-body R_FOREARM_TWIST): the right forearm's twisted ulna frames, at the bake and at the current pose.
  const SKIN_RF = BODY_SEGMENT_LIST.indexOf('r_forearm'), SKIN_RR = BODY_SEGMENT_LIST.indexOf('r_radius');
  let skinTwistBaked = null, skinTwistNow = null, skinTwistNowFor = null;
  const skinTwA = new Float64Array(16), skinTwB = new Float64Array(16), skinTwInv = new Float64Array(16);
  const twistNow = rec => { // table of the current pose (one per updateBodySkin call, shared by the records)
    if (skinTwistNowFor !== bodySkinSegs) { skinTwistNow = rForearmTwistTable(bodySkinSegs[SKIN_RF], bodySkinSegs[SKIN_RR], rec.twist); skinTwistNowFor = bodySkinSegs; }
    return skinTwistNow;
  };
  /** Per-record cache, rebuilt only when the lift amount changes: for each vertex and each of its two bones the source-
   * frame point and normal whose posing by that bone's source -> drawn matrix gives the skinned vertex (the source
   * vertex plus the lift offset turned back into that bone's rest frame). Posing is then one blend of two rigid maps. */
  function skinCache(rec) {
    const a = rec.lift ? (rec.lift.applied || 0) : 0;
    if (rec.cacheAt === a && rec.qa) return;
    const n3 = rec.src.length;
    if (!rec.qa) { rec.qa = new Float32Array(n3); rec.qb = new Float32Array(n3); rec.na = new Float32Array(n3); rec.nb = new Float32Array(n3); }
    const base = rec.baseP && rec.baseP.length === n3 ? rec.baseP : (rec.baseP = new Float32Array(n3));
    const baseN = rec.baseN && rec.baseN.length === n3 ? rec.baseN : (rec.baseN = new Float32Array(n3));
    skinBase(rec, base, baseN);
    const src = rec.src, rest = rec.rest, qa = rec.qa, qb = rec.qb, na = rec.na, nb = rec.nb, tf = rec.tf;
    if (tf && !skinTwistBaked) skinTwistBaked = rForearmTwistTable(bodySkinBaked.get('r_forearm'), bodySkinBaked.get('r_radius'), rec.twist);
    // the drawn-rest -> source map of an influence: the bake's segment inverse, or the inverse of the baked twisted frame
    const bakedInv = (seg, v) => (tf && seg === SKIN_RF && tf[v] > 0 ? rigidInv16(rForearmTwistMap(skinTwistBaked, tf[v], skinTwA), skinTwInv) : skinBakedInv[seg]);
    for (let v = 0, k = 0; k < n3; v++, k += 3) {
      const dx = base[k] - rest[k], dy = base[k + 1] - rest[k + 1], dz = base[k + 2] - rest[k + 2];
      const nx = baseN[k], ny = baseN[k + 1], nz = baseN[k + 2];
      let B = bakedInv(rec.i0[v], v);
      qa[k] = src[k] + B[0] * dx + B[4] * dy + B[8] * dz; qa[k + 1] = src[k + 1] + B[1] * dx + B[5] * dy + B[9] * dz; qa[k + 2] = src[k + 2] + B[2] * dx + B[6] * dy + B[10] * dz;
      na[k] = B[0] * nx + B[4] * ny + B[8] * nz; na[k + 1] = B[1] * nx + B[5] * ny + B[9] * nz; na[k + 2] = B[2] * nx + B[6] * ny + B[10] * nz;
      B = bakedInv(rec.i1[v], v);
      qb[k] = src[k] + B[0] * dx + B[4] * dy + B[8] * dz; qb[k + 1] = src[k + 1] + B[1] * dx + B[5] * dy + B[9] * dz; qb[k + 2] = src[k + 2] + B[2] * dx + B[6] * dy + B[10] * dz;
      nb[k] = B[0] * nx + B[4] * ny + B[8] * nz; nb[k + 1] = B[1] * nx + B[5] * ny + B[9] * nz; nb[k + 2] = B[2] * nx + B[6] * ny + B[10] * nz;
    }
    rec.cacheAt = a;
  }
  /* R558 (ns-body R_FOREARM_TWIST): a record with a forearm twist is posed as a flat blend of at most three maps per
   * vertex: its bones' maps (slots 0..segments-1) and the twisted ulna table entries (slots segments..), each in this
   * mesh's frame; a twisted influence of weight w at fraction f takes the two entries around f (w (1 - fr), w fr). The
   * slot's top bit says which of the vertex's two cached source points (qa / qb, na / nb) it poses. Made once per record. */
  function twistPlanOf(rec) {
    if (rec.tp) return rec.tp;
    const n = rec.src.length / 3, NS = bodySkinSegs.length, K = (twistNow(rec).length / 16) - 1;
    const slots = new Uint8Array(3 * n), w = new Float32Array(3 * n), { i0, i1, w0, w1, tf } = rec;
    if (NS + K + 1 > 127) fail('scene_input', 'too many skin slots');
    for (let v = 0; v < n; v++) {
      let m = 3 * v;
      const put = (seg, wt, useB) => {
        if (!(wt > 0)) return;
        const hb = useB ? 128 : 0;
        if (seg === SKIN_RF && tf[v] > 0) {
          const x = Math.min(1, tf[v]) * K, k = x >= K ? K - 1 : Math.floor(x), fr = x - k;
          slots[m] = (NS + k) | hb; w[m++] = wt * (1 - fr);
          slots[m] = (NS + k + 1) | hb; w[m++] = wt * fr;
        } else { slots[m] = seg | hb; w[m++] = wt; }
      };
      if (i0[v] === i1[v]) put(i0[v], w0[v] + w1[v], false); // one bone (or the two forearm bones merged into one twisted frame)
      else { put(i0[v], w0[v], false); put(i1[v], w1[v], true); }
      if (m - 3 * v > 3) fail('scene_input', 'a forearm skin vertex has two twisted influences');
    }
    return (rec.tp = { slots, w, NS, K });
  }
  function skinTwisted(rec, M, p, nArr) {
    const tp = twistPlanOf(rec), T = twistNow(rec), NS = tp.NS, K1 = tp.K + 1;
    const CC = rec.CC && rec.CC.length === 16 * (NS + K1) ? rec.CC : (rec.CC = new Float64Array(16 * (NS + K1)));
    for (const i of rec.used) CC.set(mul16(M, bodySkinSegs[i], skinTwB), 16 * i);
    for (let e = 0; e < K1; e++) CC.set(mul16(M, T.subarray(16 * e, 16 * e + 16), skinTwB), 16 * (NS + e));
    const S = tp.slots, W = tp.w, qa = rec.qa, qb = rec.qb, na = rec.na, nb = rec.nb, n3 = p.length;
    for (let k = 0; k < n3; k += 3) {
      let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0;
      for (let e = 0; e < 3; e++) {
        const wt = W[k + e];
        if (!(wt > 0)) continue;
        const sl = S[k + e], o = 16 * (sl & 127), Q = sl & 128 ? qb : qa, Nn = sl & 128 ? nb : na;
        const x = Q[k], y = Q[k + 1], z = Q[k + 2], a = Nn[k], b = Nn[k + 1], c = Nn[k + 2];
        px += wt * (CC[o] * x + CC[o + 4] * y + CC[o + 8] * z + CC[o + 12]);
        py += wt * (CC[o + 1] * x + CC[o + 5] * y + CC[o + 9] * z + CC[o + 13]);
        pz += wt * (CC[o + 2] * x + CC[o + 6] * y + CC[o + 10] * z + CC[o + 14]);
        nx += wt * (CC[o] * a + CC[o + 4] * b + CC[o + 8] * c);
        ny += wt * (CC[o + 1] * a + CC[o + 5] * b + CC[o + 9] * c);
        nz += wt * (CC[o + 2] * a + CC[o + 6] * b + CC[o + 10] * c);
      }
      p[k] = px; p[k + 1] = py; p[k + 2] = pz;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nArr[k] = nx / l; nArr[k + 1] = ny / l; nArr[k + 2] = nz / l;
    }
  }
  function skinOne(rec) {
    const p = rec.pos.array, nArr = rec.nor.array;
    if (!bodySkinOn || !bodySkinSegs) {
      if (!rec.skinned) return false;
      skinBase(rec, p, nArr); rec.skinned = false; rec.relValid = false;
    } else {
      skinCache(rec);
      // C = (drawn -> this mesh's own frame) x (the bone's source -> drawn pose), per bone this muscle uses.
      const M = rigidInv16(rec.b.mesh.matrix.elements, skinMeshInv), C = rec.C || (rec.C = []);
      for (const i of rec.used) C[i] = mul16(M, bodySkinSegs[i], C[i] || new Float64Array(16));
      const n3 = p.length, qa = rec.qa, qb = rec.qb, na = rec.na, nb = rec.nb, i0 = rec.i0, i1 = rec.i1, w0 = rec.w0, w1 = rec.w1;
      if (rec.tf) skinTwisted(rec, M, p, nArr);
      else for (let v = 0, k = 0; k < n3; v++, k += 3) {
        const A = C[i0[v]], B = C[i1[v]], wa = w0[v], wb = w1[v];
        const ax = qa[k], ay = qa[k + 1], az = qa[k + 2], bx = qb[k], by = qb[k + 1], bz = qb[k + 2];
        p[k] = wa * (A[0] * ax + A[4] * ay + A[8] * az + A[12]) + wb * (B[0] * bx + B[4] * by + B[8] * bz + B[12]);
        p[k + 1] = wa * (A[1] * ax + A[5] * ay + A[9] * az + A[13]) + wb * (B[1] * bx + B[5] * by + B[9] * bz + B[13]);
        p[k + 2] = wa * (A[2] * ax + A[6] * ay + A[10] * az + A[14]) + wb * (B[2] * bx + B[6] * by + B[10] * bz + B[14]);
        const mx = na[k], my = na[k + 1], mz = na[k + 2], ox = nb[k], oy = nb[k + 1], oz = nb[k + 2];
        const qx = wa * (A[0] * mx + A[4] * my + A[8] * mz) + wb * (B[0] * ox + B[4] * oy + B[8] * oz);
        const qy = wa * (A[1] * mx + A[5] * my + A[9] * mz) + wb * (B[1] * ox + B[5] * oy + B[9] * oz);
        const qz = wa * (A[2] * mx + A[6] * my + A[10] * mz) + wb * (B[2] * ox + B[6] * oy + B[10] * oz);
        const l = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
        nArr[k] = qx / l; nArr[k + 1] = qy / l; nArr[k + 2] = qz / l;
      }
      rec.skinned = true;
    }
    rec.pos.needsUpdate = true; rec.nor.needsUpdate = true;
    pickBufferWritten(p);
    lodTouch(rec.geo); // R558: the body's coarser copies follow
    bodySkinWrites++;
    return true;
  }
  /** True when this muscle's bones and its own rigid matrix kept their pose relative to its first bone since its last
   * skin (within 1e-5 rotation / 1e-3 mm); records the new relative pose either way. */
  function skinPoseSame(rec) {
    const used = rec.used, last = rec.relLast || (rec.relLast = new Float64Array(16 * (used.length + 1)));
    const refInv = rigidInv16(bodySkinSegs[used[0]], skinRefInv);
    let same = rec.relValid === true, off = 0;
    const keep = m => {
      const r = mul16(refInv, m, skinRelTmp);
      for (let k = 0; k < 16; k++) {
        if (same && Math.abs(r[k] - last[off + k]) > (k >= 12 ? 1e-3 : 1e-5)) same = false;
        last[off + k] = r[k];
      }
      off += 16;
    };
    for (let j = 1; j < used.length; j++) keep(bodySkinSegs[used[j]]);
    keep(rec.b.mesh.matrix.elements);
    rec.relValid = true;
    return same;
  }
  function updateBodySkin(segments = null) {
    if (!bodySkin.size) return 0;
    let n = 0;
    if (segments) {
      if (!(segments instanceof Map) || !bodySkinBaked) fail('scene_input', 'updateBodySkin needs poseBodyDetailed().segments after setBodySkin');
      const segOrder = [...bodySkinBaked.keys()];
      if (!skinBakedInv) skinBakedInv = segOrder.map(s => rigidInv16(bodySkinBaked.get(s), new Float64Array(16)));
      bodySkinSegs = segOrder.map(s => segments.get(s) || bodySkinBaked.get(s));
      bodySkinOn = true;
      // Per-frame cost guard. The body is re-posed whenever anything in its key changes (the left arm's bridge; the trunk
      // turning or bending under a wide look; the Space dance turning the forearm and the upper arm). The vertices are
      // written in each muscle's own frame, and the blend is the same rigid map of every bone it uses, so a muscle whose
      // bones and own rigid matrix all keep their pose relative to its first bone needs no new vertices: only the rigid
      // matrix updateBody has just set moves. Each muscle is re-skinned only when that relative pose changes (a finger or
      // the wrist bends; for the long forearm muscles also the palm turning; for those that reach the upper arm the elbow).
      for (const rec of bodySkin.values()) {
        if (skinPoseSame(rec) && rec.skinned) continue;
        if (skinOne(rec)) n++;
      }
      return n;
    }
    bodySkinOn = false;
    for (const rec of bodySkin.values()) if (skinOne(rec)) n++;
    return n;
  }

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
      shadeBodyMuscle(b); // R558: in its area's colour, on all three bodies
      b.mesh.userData.activity = q;
    }
    return n;
  }

  /** Face layer mode: 'ghost' (default) | 'inset' | 'off' (FACE_VIEW_MODES). */
  function setFaceView(mode) {
    if (!FACE_VIEW_MODES.includes(mode) && !RETIRED_FACE_VIEW_MODES.includes(mode)) fail('scene_args', `face view must be one of ${FACE_VIEW_MODES.join(', ')}`);
    faceMode = 'off'; // R558 (R26): no control can turn the floating own face back on
    faceStateKey = '';
    overlayDirty = true;
    return faceMode;
  }

  /** R558 (FIRST_PERSON_BODY): set the first-person uniform for the frame about to be drawn. amount: 1 in the ordinary
   * view once the camera has backed away from the arm's parent point, ns-camera's first-person share while the view
   * changes to or from the view from behind, 0 there and with the camera at the eye. */
  function updateFirstPersonBody() {
    let amount = 0, back = 0;
    if (!OWN_BODY_SOLID && body.length > 0) {
      // Review fix: while the view changes to or from the view from behind, the rule fades from what it WAS in the
      // ordinary view (base). Without the whole-arm display the camera is at the eye and the rule was off there, so it
      // must stay off through the change instead of switching on for the first frames.
      if (camPose) amount = firstPersonBody.base * fin01(camMul.overBrain);
      else {
        if (firstPose) back = Math.hypot(firstPose.position[0] - eyeRig.position.x, firstPose.position[1] - eyeRig.position.y, firstPose.position[2] - eyeRig.position.z);
        amount = back > FIRST_PERSON_BODY.minBackM ? 1 : 0;
        firstPersonBody.base = amount;
      }
    }
    firstPersonBody.amount = amount; firstPersonBody.backM = back;
    if (amount > 0) {
      camera.updateMatrixWorld(true); bodyGroup.updateMatrixWorld(true);
      pv.set(eyeBp[0], eyeBp[1], eyeBp[2]).applyMatrix4(bodyGroup.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      firstPersonUniform.value.set(pv.x, pv.y, pv.z, amount);
      // The body's forward direction (source anterior = -y) in view space: -(column 1 of the body frame), unit, turned
      // into the camera's frame.
      const e = bodyGroup.matrixWorld.elements, v = camera.matrixWorldInverse.elements;
      const ax = -e[4], ay = -e[5], az = -e[6], n = Math.hypot(ax, ay, az) || 1;
      firstPersonAxisUniform.value.set((v[0] * ax + v[4] * ay + v[8] * az) / n, (v[1] * ax + v[5] * ay + v[9] * az) / n, (v[2] * ax + v[6] * ay + v[10] * az) / n, 0);
    } else firstPersonUniform.value.w = 0;
  }

  /** R558 (FIRST_PERSON_BODY): how much of a point of your own body (world metres) the last set frame draws, 0..1
   * (1 when the rule is off). legs: the point belongs to a leg (the legs' own plane). */
  function firstPersonShareAt(x, y, z, legs) {
    const fp = firstPersonUniform.value;
    if (!(fp.w > 0)) return 1;
    const v = camera.matrixWorldInverse.elements, n = firstPersonAxisUniform.value;
    const dx = v[0] * x + v[4] * y + v[8] * z + v[12] - fp.x, dy = v[1] * x + v[5] * y + v[9] * z + v[13] - fp.y, dz = v[2] * x + v[6] * y + v[10] * z + v[14] - fp.z;
    return firstPersonShare(dx * n.x + dy * n.y + dz * n.z, fp.w, legs === true);
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
    // R558 (FIRST_PERSON_BODY): the flags above say which parts are inside the camera's view volume, as before; this
    // says how much of the first-person rule the last frame drew with (a part inside the volume may be hidden by it).
    out.firstPersonBody = { amount: Math.round(firstPersonBody.amount * 1000) / 1000, cameraBackM: Math.round(firstPersonBody.backM * 1000) / 1000,
      eyeViewM: firstPersonBody.amount > 0 ? [firstPersonUniform.value.x, firstPersonUniform.value.y, firstPersonUniform.value.z].map(v => Math.round(v * 1000) / 1000) : null,
      forwardView: firstPersonBody.amount > 0 ? [firstPersonAxisUniform.value.x, firstPersonAxisUniform.value.y, firstPersonAxisUniform.value.z].map(v => Math.round(v * 1000) / 1000) : null,
      planeHideM: FIRST_PERSON_BODY.planeHideM, planeFullM: FIRST_PERSON_BODY.planeFullM, legsHideM: FIRST_PERSON_BODY.legsHideM, legsFullM: FIRST_PERSON_BODY.legsFullM, shader: firstPersonBody.applied };
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
        // R5-scene: the 3D arrows' projected boxes (+4 px), obstacles for the HUD labels and the guide line.
        if (p && p.box) arrowsOut.push({ dir: d, target: 'brain', x0: Math.max(0, (p.box.x0 - 4) / cssW), y0: Math.max(0, (p.box.y0 - 4) / cssH), x1: Math.min(1, (p.box.x1 + 4) / cssW), y1: Math.min(1, (p.box.y1 + 4) / cssH) });
      }
    }
    // R558 (Message 7): the mirror body's V tips are drawn on top of the scene too, so the HUD keeps off them as well
    // (target 'mirror'; callers that need the brain's own tips select target 'brain').
    const MS = arrowSets.mirror;
    if (MS.shown && MS.boxes && cssW > 0 && cssH > 0) {
      for (const d of ARROW_DIRS) {
        const b = MS.boxes[d];
        if (b) arrowsOut.push({ dir: d, target: 'mirror', x0: Math.max(0, (b.x0 - 4) / cssW), y0: Math.max(0, (b.y0 - 4) / cssH), x1: Math.min(1, (b.x1 + 4) / cssW), y1: Math.min(1, (b.y1 + 4) / cssH) });
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
    // R558 (Message 31): the brain frame's planned top tip (its drawn box at hover size, CSS px, in the plan's reference
    // view; look-independent), so the guide chip can sit centred just below it.
    const bp = arrowSets.brain.plan && arrowSets.brain.plan.spots && arrowSets.brain.plan.spots.forward;
    const brainTopPlanPx = arrowSets.brain.shown && bp && bp.box ? { ...bp.box } : null;
    return { brainInView: brainInViewAttr === 'true', arrows: arrowsOut, infoBottom, toasts, labelsPx, brainTopPlanPx };
  }
  /** R558 (issue hunt 2: the "Try this" chip covered your shin, forearm; "Front (anterior)" was printed across the mirror
   * body's belly): the on-screen boxes (CSS px, clipped to the view) of your own body and of the mirror body, for the
   * HUD to keep its chip and the orientation labels off them. Your body: its posed sample (the mesh box corners the mirror
   * plane is measured from) with points within ownNearM of the camera left out (round the eye in first person they would
   * spread the box over the whole view); the mirror body: its sample as drawn now. { own, mirror } (null when not in
   * view). Cached per camera, pose and mirror state. */
  // everyFrames: while the camera keeps moving the boxes are made again at most every this many drawn frames (a few
  // thousand points projected), and at once when it rests.
  const BODY_BOX = Object.freeze({ ownNearM: 0.3, everyFrames: 4 });
  let bodyBoxCache = null, bodyBoxKey = '', bodyBoxAt = -1e9;
  function bodyScreenBoxes() {
    if (!(cssW > 0 && cssH > 0)) return { own: null, mirror: null };
    const cam = arrowCam();
    const key = `${arrowCameraKey(cam)}|${mirror.serial}|${bodyPoseSerial}|${mirrorRoot.visible}|${Boolean(mirror.samples)}`;
    if (bodyBoxCache && key === bodyBoxKey) return bodyBoxCache;
    if (bodyBoxCache && frameVis.tick - bodyBoxAt < BODY_BOX.everyFrames) return bodyBoxCache;
    bodyBoxAt = frameVis.tick;
    const clip = b => {
      if (!b) return null;
      const r = { x0: Math.max(0, b.x0), y0: Math.max(0, b.y0), x1: Math.min(cssW, b.x1), y1: Math.min(cssH, b.y1) };
      return r.x1 > r.x0 && r.y1 > r.y0 ? r : null;
    };
    let own = null, mir = null;
    const S = mirror.samples;
    if (S && S.length >= 6) {
      const p = cam.position, keep = [];
      for (let i = 0; i + 2 < S.length; i += 3) if (Math.hypot(S[i] - p[0], S[i + 1] - p[1], S[i + 2] - p[2]) > BODY_BOX.ownNearM) keep.push(S[i], S[i + 1], S[i + 2]);
      if (keep.length >= 6) own = clip(NsArrows.screenBoxOf(NsArrows.projectPointsPx(Float64Array.from(keep), null, cam).xy));
    }
    const MW = mirrorRoot.visible ? mirrorSamplesWorld() : null;
    if (MW) mir = clip(NsArrows.screenBoxOf(NsArrows.projectPointsPx(MW, null, cam).xy));
    bodyBoxCache = { own, mirror: mir }; bodyBoxKey = key;
    return bodyBoxCache;
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
  // R558 performance: the old test rebuilt a filled 4 px occupancy grid of every motor triangle whenever the camera
  // moved (about a fifth of the frame time while looking around). The same question is now answered from the motor
  // areas' own vertices projected once per camera / brain change: a rect covers a motor area when a projected vertex
  // lies inside it grown by motorCoverPadPx. The region meshes are dense (their vertices are a few px apart on screen),
  // so this keeps the "never over a motor area" rule for HUD lines with a margin instead of a per-cell fill.
  const motorCover = { key: new Float64Array(35), valid: false, xy: null, n: 0 };
  const motorCoverPadPx = 8;
  function motorCoversRect(rect) {
    if (!rect || !(cssW > 0 && cssH > 0)) return false;
    const P = motorSamplePoints();
    if (!P) return brainCoversRect(rect);
    camera.updateMatrixWorld(true);
    const me = brainGroup.matrixWorld.elements, ve = camera.matrixWorldInverse.elements, K = motorCover.key;
    let same = motorCover.valid && K[32] === cssW && K[33] === cssH && K[34] === camera.fov;
    for (let i = 0; i < 16 && same; i++) same = K[i] === me[i] && K[16 + i] === ve[i];
    if (!same) {
      for (let i = 0; i < 16; i++) { K[i] = me[i]; K[16 + i] = ve[i]; }
      K[32] = cssW; K[33] = cssH; K[34] = camera.fov;
      if (!motorCover.xy || motorCover.xy.length < (P.length / 3) * 2) motorCover.xy = new Float32Array((P.length / 3) * 2);
      const pm = camera.projectionMatrix, xy = motorCover.xy;
      let n = 0;
      for (let i = 0; i < P.length; i += 3) {
        pv.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(brainGroup.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        if (pv.z > -near) continue;
        pv.applyMatrix4(pm);
        xy[n++] = (pv.x + 1) * 0.5 * cssW; xy[n++] = (1 - pv.y) * 0.5 * cssH;
      }
      motorCover.n = n; motorCover.valid = true;
    }
    const xy = motorCover.xy, x0 = rect.x0 - motorCoverPadPx, x1 = rect.x1 + motorCoverPadPx, y0 = rect.y0 - motorCoverPadPx, y1 = rect.y1 + motorCoverPadPx;
    for (let i = 0; i < motorCover.n; i += 2) if (xy[i] >= x0 && xy[i] <= x1 && xy[i + 1] >= y0 && xy[i + 1] <= y1) return true;
    return false;
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
  /** R558 (performance): the parts of the information panel whose writes cannot change its size (the activity's number,
   * colour swatch, meter and meter mark); setInfo itself says when the number's count of characters changes. */
  const infoQuietTarget = t => Boolean(info) && (t === info.activity || t === info.swatch || t === info.meterMark || t === info.meter);
  function relevantHudRecord(rec) {
    let t = rec && rec.target;
    if (t && t.nodeType === 3) t = t.parentNode;
    if (!t || t === canvas) return false;
    if (inside(overlay, t)) return Boolean(info && inside(info.panel, t)) && !infoQuietTarget(t);
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
  /** R558 (Messages 44 and 48, text that is easy to read): the short card shows each of its parts whole or leaves it
   * out; nothing is cut through. The short card has a greatest height (INFO_PANEL.cornerShortVh). On a card with many
   * lines the lead sentence used to give way pixel by pixel and ended as a sliver of a line, and in a small window the
   * card's last rows were cut through the middle. Here the card is tried with everything, and while it runs over one
   * more part is left out, in this order: the lead sentence (the numbered movements say the same), the signal path, the
   * muscles that work the other way, the muscles that pull. Title, strip part, signal bar and the numbered movements
   * always stay. The mark (data-ns-trim on the panel, "0" to "4") is read by the CSS of the short card only, so the
   * opened card (key R) always has every part. Tried again only when the card's content, the view's size or the card's
   * mode changed: the mark's own write makes the HUD boxes be read once more, not this. */
  const INFO_TRIM_MAX = 4;
  function fitInfoCard() {
    const p = info && info.panel;
    if (!p || p.hidden || typeof p.setAttribute !== 'function' || typeof p.getAttribute !== 'function') return;
    if (!(p.clientHeight > 0)) { info.fitSig = null; return; } // not drawn (information hidden): try when it is
    const root = typeof p.closest === 'function' ? p.closest('.ns-app') : null;
    const open = Boolean(info.more && info.more.open) || Boolean(root && root.getAttribute('data-ns-unfold') === 'true');
    const sig = `${cssW}x${cssH}|${info.grewN | 0}|${open ? 1 : 0}`;
    if (sig === info.fitSig) return;
    info.fitSig = sig;
    for (let t = 0; t <= (open ? 0 : INFO_TRIM_MAX); t++) {
      const mark = String(t);
      if (p.getAttribute('data-ns-trim') !== mark) p.setAttribute('data-ns-trim', mark);
      const over = p.scrollHeight - p.clientHeight;
      if (!(Number.isFinite(over) && over > 1)) break;
    }
  }
  function readHudRectsNow(key) {
    hudRectCache = [];
    try { fitInfoCard(); } catch { /* the card keeps its last mark */ }
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
  // Nominal unhovered landmarks of each V tip from the SAME design as makeArrowRig (the middle of its open ends and its
  // point, at mid thickness, where the tilted solid has them; the record keeps its older names headBase / headTip).
  // Built during normal planning only.
  function nominalArrowHeads(frames) {
    if (!arrowHeadLocal) {
      const o = NsArrows.arrowTipOutline(NsArrows.ARROW_DESIGN);
      arrowHeadLocal = { base: o.mouth3.slice(), tip: o.point3.slice() };
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
  /** R558 (Message 7): the mirror body's on-screen box (CSS px) seen from a reference camera { yaw, pitch, position },
   * from the body sample as the renderer places it NOW (mirror.transform) but WITHOUT its moves along the ground (the
   * push, the outside view's slide and a tilt's clearance, a pure shift: transform centre minus carryCentre), or null
   * when it is not shown. The frame is planned again only for a new place (planFrames' key), so an arrow tap never moves
   * the tips (the user: arrows "stay in place after tapping on them"). */
  function mirrorBoxPx(look) {
    if (!mirrorRoot.visible || !mirror.transform) return null;
    const W = mirrorSamplesWorld();
    if (!W) return null;
    const T = mirror.transform, cc = T.carryCentre || T.centre;
    const px = T.centre[0] - cc[0], py = T.centre[1] - cc[1], pz = T.centre[2] - cc[2];
    if (px || py || pz) for (let i = 0; i < W.length; i += 3) { W[i] -= px; W[i + 1] -= py; W[i + 2] -= pz; }
    const { xy, behind } = NsArrows.projectPointsPx(W, null, { width: cssW, height: cssH, fovYDeg: camera.fov, yaw: look.yaw, pitch: look.pitch, position: look.position || activePosition() });
    return behind > 0 ? null : NsArrows.screenBoxOf(xy);
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
  /** R558 (Messages 55 / 56): the motor areas' occupancy grid (CSS px, no margin) with the brain at REST (un-turned,
   * ns-brain restMatrix) seen from a plan's reference camera: tipBlocker tests a tip's click area against it, so at the
   * start a click on a motor area never lands on an arrow. Kept for the last camera asked (the brain's and the mirror
   * body's plans usually share it). null before the region meshes and the rest matrix exist. */
  let motorRestGridMemo = null;
  function motorRestGrid(refCam) {
    const P = motorSamplePoints(), e = brainRestElements;
    if (!P || !e || !(refCam.width > 0 && refCam.height > 0)) return null;
    const key = `${refCam.width}x${refCam.height}|${refCam.fovYDeg}|${refCam.yaw},${refCam.pitch}|${refCam.position.join(',')}|${Array.prototype.join.call(e, ',')}|${compassBrainSourceRevision}`;
    if (!motorRestGridMemo || motorRestGridMemo.key !== key) {
      motorRestGridMemo = { key, grid: NsArrows.occupancyGrid(NsArrows.projectPointsPx(P, Array.from(e), refCam).xy,
        { width: refCam.width, height: refCam.height, cellPx: R5_BIGBRAIN.avoidCellPx, dilate: 0, indices: motorIndices }) };
    }
    return motorRestGridMemo.grid;
  }
  /** R558 (Messages 55 / 56): the box the mirror body's 9:16 arrow frame is built from, seen from a reference camera
   * (see updateArrows): its on-screen box padded by a tip and cut to the usable view U. { box, keep } or null. */
  function mirrorFrameBox(refCam, U, mSize) {
    const full = mirrorBoxPx(refCam);
    if (!full) return null;
    const o = NsArrows.arrowTipOutline(NsArrows.ARROW_DESIGN), pad = o.halfAlong * mSize;
    const g = { x0: full.x0 - pad, y0: full.y0 - pad, x1: full.x1 + pad, y1: full.y1 + pad };
    const cut = { x0: Math.max(g.x0, U.x0), y0: Math.max(g.y0, U.y0), x1: Math.min(g.x1, U.x1), y1: Math.min(g.y1, U.y1) };
    if (cut.x1 > cut.x0 && cut.y1 > cut.y0 && (cut.x0 !== g.x0 || cut.x1 !== g.x1 || cut.y0 !== g.y0 || cut.y1 !== g.y1)) {
      return { box: cut, keep: { x: cut.x0 !== g.x0 || cut.x1 !== g.x1, y: cut.y0 !== g.y0 || cut.y1 !== g.y1 } };
    }
    return { box: full, keep: null };
  }
  /** R558 (Message 7): plan one target's four V tips on its frame (ns-arrows3d planFrameArrows) and keep the evidence
   * record the read-only arrow trace reports. */
  function planFrame(set, args, record) {
    set.planningCamera = arrowCameraRecord(args.cam); set.planningCameraKey = arrowCameraKey(args.cam);
    set.planningTarget = { centreWorldM: Array.from(args.centre), supportRows: null };
    set.planningTargetKey = arrowTargetKey(set.target);
    set.planningEvidence = { kind: 'ns-frame-tip-plan-r558',
      sourceBinding: 'Runtime labels only; not file-hash proof.',
      eligibility: arrowEligibility(set.target), source: arrowSourceRecord(set.target),
      targetBoxPx: args.box ? { ...args.box } : null, aspect: args.aspect, boundsPx: args.bounds ? { ...args.bounds } : null, sizePx: args.sizePx, avoidBoxes: args.avoid ? args.avoid.length : 0,
      camera: arrowCameraRecord(args.cam), targetKey: set.planningTargetKey, cameraKey: set.planningCameraKey, revision: (set.serial || 0) + 1,
      lookIndependent: true, report: { outcome: 'NOT_REACHED' } };
    set.nominalHeads = null; set.planningError = null; set.frameRecord = null;
    try {
      const p = args.box ? NsArrows.planFrameArrows(args) : null; arrowStats.plans++;
      set.planningOutcome = p ? 'planned' : 'no-visible-target';
      set.planningEvidence.report = { outcome: p ? 'planned' : args.box ? 'centre_not_in_front_of_reference_camera' : 'no_target_box' };
      if (p) {
        set.nominalHeads = nominalArrowHeads(p.frames);
        const r1 = v => Math.round(v * 10) / 10, box = b => [r1(b.x0), r1(b.y0), r1(b.x1), r1(b.y1)];
        set.frameRecord = { ...record, aspect: args.aspect, targetBoxPx: box(args.box), framePx: box(p.rect), fittedPx: box(p.rect.fitted), clamped: { ...p.rect.clamped },
          sizePx: r1(args.sizePx), spots: Object.fromEntries(ARROW_DIRS.map(d => { const q = p.spots[d], pr = q.pair || null;
            return [d, { midPx: q.mid.map(r1), atPx: [r1(q.x), r1(q.y)], insetPx: r1(q.insetPx), overlap: q.overlap,
              pair: pr ? { family: pr.family, insetPx: r1(pr.insetPx), movePx: r1(pr.movePx), shiftPx: r1(pr.shiftPx), blockedIgnored: pr.blockedIgnored } : null }]; })) };
      }
      return p;
    } catch (err) { set.planningOutcome = 'error'; set.planningError = arrowRigError = String((err && err.message) || err); return null; }
  }
  let mirrorSamplesSeen = null, mirrorSamplesRev = 0; // R558 (hunt 2): the mirror body's measured sample, as a key part
  /** R558 (user Message 31: "left/right arrows of mirror body do not match in height level"): the places a tip may not
   * take while its frame is planned, as one test for ns-arrows3d frameArrowSpots `blocked`, which moves the tips in
   * PAIRS (left + right at one height, forward + back on one vertical line; FRAME_PAIR). Hunt 2 slid each tip on its own
   * along its side instead (TIP_BODY_SLIDE, slideTipsOffBox): at 1600x900 the mirror body's left tip went 120 px down off
   * your left hand while its right tip stayed, and in a portrait window the brain's bottom tip went 204 px aside off the
   * mirror body while its top tip stayed. Blocked (CSS px in the plan's reference view `cam`):
   *  - covered by your own body: two of three sight lines through the tip (its middle and 0.35 x sizePx either way
   *    along its side) meet your body nearer than the tip's world anchor (the FRAME_VIS rule, which would hide it);
   *  - `box` (optional): the tip's drawn box at hover size, padded by gapPx, overlaps it (the brain's tips keep off the
   *    mirror body's box, padded so the mirror's own tips keep their room);
   *  - `grid` (optional, R558 Messages 55 / 56): the tip's CLICK area (ns-arrows3d arrowHitHalfPx, or its hovered drawn
   *    size where that is larger) lies over a marked cell (motorRestGrid: the motor areas at rest). The motor areas are
   *    what the player aims at and learns from; a tip over one hid it and took its clicks. */
  function tipBlocker({ cam, centre, sizePx, box = null, gapPx = 4, grid = null }) {
    const o = NsArrows.arrowTipOutline(NsArrows.ARROW_DESIGN), grow = NsArrows.ARROW_LOOK.hoverScale;
    const hit = NsArrows.arrowHitHalfPx(sizePx);
    const kA = Math.max(hit.halfAlongPx, o.halfAlong * sizePx * grow), kC = Math.max(hit.halfAcrossPx, o.halfAcross * sizePx * grow);
    let test = null, anchorAt;
    // R558 (performance, P3): frameArrowSpots asks the same place (dir, x, y) several times while it looks for a pair's
    // place (each tip alone, then both together, then the common shifts); within one plan nothing the answer depends on
    // changes (the sight-line tester and the boxes are fixed for the plan), so each place is worked out once.
    const seen = new Map();
    return (dir, x, y) => {
      let byX = seen.get(dir);
      if (!byX) seen.set(dir, (byX = new Map()));
      let byY = byX.get(x);
      if (!byY) byX.set(x, (byY = new Map()));
      let v = byY.get(y);
      if (v === undefined) { v = blockedAt(dir, x, y); byY.set(y, v); }
      return v;
    };
    function blockedAt(dir, x, y) {
      const side = NsArrows.COMPASS_SCREEN[dir][0] !== 0;
      if (box) {
        const hx = (side ? o.halfAlong : o.halfAcross) * sizePx * grow, hy = (side ? o.halfAcross : o.halfAlong) * sizePx * grow;
        if (x - hx < box.x1 + gapPx && x + hx > box.x0 - gapPx && y - hy < box.y1 + gapPx && y + hy > box.y0 - gapPx) return true;
      }
      if (grid) {
        const kx = side ? kA : kC, ky = side ? kC : kA;
        if (grid.hits({ x0: x - kx - 1, y0: y - ky - 1, x1: x + kx + 1, y1: y + ky + 1 }) > 0) return true;
      }
      if (!body.length) return false;
      // the anchor through the place: frameArrowAnchors' arithmetic with the camera and centre worked out once
      if (anchorAt === undefined) { try { anchorAt = NsArrows.frameAnchorFn(cam, centre); } catch { anchorAt = null; } }
      let a = null;
      try { a = anchorAt ? anchorAt(x, y) : null; } catch { a = null; }
      if (!a) return false;
      const dist = Math.hypot(a[0] - cam.position[0], a[1] - cam.position[1], a[2] - cam.position[2]);
      const h = 0.35 * sizePx, ax = side ? 0 : h, ay = side ? h : 0;
      if (!test) test = ownSightTester(cam);
      let k = 0;
      for (const t of [0, -1, 1]) if (test(x + t * ax, y + t * ay, dist) && ++k >= 2) return true;
      return false;
    }
  }
  /** R558 (Message 7): where the V tips may lie (CSS px): the arrows' usable view (the view minus a margin, the top
   * line and the portrait band) and, in a portrait window, below the status card's planned full-width band at the top
   * (ns-app brainUsableNdc keeps the same room: top line + 12 + statusCardPlanPx + 8). View size only, so a frame never
   * moves while playing. */
  function tipBounds() {
    const U = arrowUsable();
    if (cssW / cssH < 1) {
      const top = NsBrain.BRAIN_VIEW && Number.isFinite(NsBrain.BRAIN_VIEW.topReservePx) ? NsBrain.BRAIN_VIEW.topReservePx : 26;
      U.y0 = Math.min(U.y1 - 40, Math.max(U.y0, top + 12 + statusCardPlanPx(cssW, cssH, true) + 8));
    }
    return U;
  }
  /** R558 (Message 7): the motor strip's on-screen box at REST (every motor-area sample point through the brain's
   * un-turned matrix, ns-brain restMatrix) seen from a reference camera; null before the region meshes and the rest
   * matrix exist or when a point lies behind that camera. */
  function motorRestBoxPx(refCam) {
    const P = motorSamplePoints(), e = brainRestElements;
    if (!P || !e) return null;
    const { xy, behind } = NsArrows.projectPointsPx(P, Array.from(e), refCam);
    return behind > 0 ? null : NsArrows.screenBoxOf(xy);
  }
  /** Both rigs. R558 (user Message 7): "think of the motor strip as a horizontal 16:9 frame and the mirror as a vertical
   * 9:16 frame, the arrows will be at the centered edges of each frame perimeter side".
   *  - Brain: the smallest 16:9 rectangle containing the motor strip's on-screen box at REST (the brain un-turned), seen
   *    from the fixed reference eye with the brain's reference look (arrowRef: the start look, or the look the brain
   *    was last carried along), centred on that box and clamped to the usable view (tipBounds: the view minus a
   *    margin, the top line and the HUD bands); its four tips at the midpoints of its four sides, pointing outward, moved
   *    inward only as far as their drawn boxes (hovered size) need to stay inside the usable view (the left and right
   *    tips both by the same amount).
   *  - Mirror body: the smallest 9:16 rectangle containing its on-screen box (its body sample as the renderer places it
   *    now, read at run time, less its moves along the ground; a tap on an arrow never moves a tip), the same way,
   *    seen from the reference eye with the START look while the body's centre
   *    lies well inside that view, else with the look straight at its centre (a body carried far aside). Where its
   *    tips would overlap a brain tip (the brain's tips come first), the crosshair box or your own body, they move.
   *  - R558 (Message 31, symmetry): the tips always move in PAIRS (ns-arrows3d frameArrowSpots, FRAME_PAIR): the left
   *    and right tips stay at exactly one height and the top and bottom tips on one vertical line, by preference on the
   *    frame's centre lines and at mirrored insets; a pair that must clear something moves together (along its centre
   *    line by the same amount, or both across it by the same amount); only where one tip cannot follow does each move
   *    along its own pointing axis alone (still level). Exact mirror symmetry about the view's centre is not the rule:
   *    the frames are fitted to the targets as they stand (a mirror body carried aside has its frame there).
   *  - No tip of either set is planned on the box kept free round the crosshair of its reference view; a tip that has
   *    to move keeps clear of the HUD cards and the hint line.
   *  - R558 (Messages 55 / 56, the brain above the mirror body): no tip of either set is planned where its click area
   *    covers a motor area of the brain at rest (motorRestGrid), and the brain's tips keep off the click area of the
   *    mirror body's top tip, which stays on the middle of its frame's top side. The brain's BOTTOM tip therefore does
   *    not sit on the middle of its frame's bottom side (that is where the mirror body's top tip is): it moves up its
   *    centre line into the hollow of the strip's U (BRAIN_TIP_RULES). This is a known departure from "the centered
   *    edges of each frame" for that one tip; the other three brain tips are on their sides' middles or a few px out.
   *    (The brain's plan uses the brain's reference look and the mirror's its own; they are the same look at the
   *    start, which is when the two frames meet.)
   * A frame is made again only when something it depends on changes: the view size, field of view or usable view, the
   * reference eye and look, the target's place (a carry, or a reset that puts it back), the brain's rest matrix and
   * source, the mirror body's scale and measured sample. Turning a target, tapping an arrow or looking around changes
   * none of these, so the tips stay where they are. (A frame made while the mirror body is turned, e.g. after a window
   * resize, is fitted to the body as it then stands.) */
  function updateArrows() {
    if (!(cssW > 0 && cssH > 0)) return;
    const B = arrowSets.brain, M = arrowSets.mirror, cam = arrowCam();
    const hudObs = arrowObstacles(); // also keeps the HUD-panel key current for the under-panel mask below
    // a tip that would have to move off its side's midpoint (see avoid) keeps clear of the HUD cards and the hint line,
    // and no tip is planned on the box round the crosshair of its reference view (a look at the start must not rest on an
    // arrow; with a literal mirror reflection the mirror body's head, and so its top side, is at eye level)
    const keepOut = hudObs.filter(r => !r.crosshair), crossBox = hudObs.find(r => r.crosshair) || null;
    const eye = referenceOriginSet ? referenceOrigin : [0, 0, 0];
    const U = tipBounds();
    const view = `${cssW}x${cssH}|${camera.fov}|${eye[0]},${eye[1]},${eye[2]}|${U.x0},${U.y0},${U.x1},${U.y1}`;
    const showB = Boolean(B.rig) && regionMode && brainTransformSet && Boolean(brainSupport) && brainGroup.visible;
    if (mirrorSamplesSeen !== mirror.samples) { mirrorSamplesSeen = mirror.samples; mirrorSamplesRev++; }
    const mirrorPlace = mirror.transform && mirror.samples && mirrorRoot.visible ? `${(mirror.transform.carryCentre || mirror.transform.centre).join(',')}|${mirror.transform.scale}|${mirrorSamplesRev}` : 'no-mirror';
    if (showB) {
      const e = brainGroup.matrixWorld.elements, centre = farEyeView.pw || [e[12], e[13], e[14]], r = brainRestElements;
      // R558 (hunt 2): the mirror body's place is part of the key: the brain's tips keep off the mirror body's box.
      const key = `${view}|${compassBrainSourceRevision}|${centre[0]},${centre[1]},${centre[2]}|${arrowRef.yaw},${arrowRef.pitch}|${r ? Array.prototype.join.call(r, ',') : 'no-rest'}|${mirrorPlace}|own${body.length}`;
      // (a turned brain whose transform carries no rest matrix keeps its frame: a frame is never fitted to a turned brain)
      // R558 (performance): nor is a frame planned again while an item is held (setHeldItem): once it is let go
      if (key !== B.key && (r || !B.frames) && (!arrowHeld || !B.key)) {
        B.key = key;
        const refCam = { width: cssW, height: cssH, fovYDeg: camera.fov, yaw: arrowRef.yaw, pitch: arrowRef.pitch, position: Array.from(eye) };
        const bSize = NsArrows.arrowTipSizePx(cam, 'brain');
        // R558 (issue hunt 2, portrait: the brain's bottom tip lay across the mirror body's chest): the brain's tips keep off
        // the mirror body's box (padded by a mirror tip, so the mirror's own tips keep their room) and off places your own
        // body covers in this view. R558 (Message 31): they move in pairs to do so (tipBlocker, ns-arrows3d FRAME_PAIR).
        // R558 (Messages 55 / 56): the brain now sits just above the mirror body's head, so three more things hold:
        //  - the mirror body's TOP tip keeps its own place (the middle of its frame's top side): its click area there is
        //    kept free of the brain's tips, which are planned first (mTop);
        //  - no brain tip lies over a motor area (motorRestGrid): the left and right tips move out off the strip's ends;
        //  - the brain's bottom tip, whose side's middle is where the mirror body's top tip is, moves up into the hollow
        //    of the strip's U (BRAIN_TIP_RULES; the 0.5 default would stop it on the leg areas).
        let mPad = null, mTop = null;
        if (mirrorRoot.visible && mirror.transform && mirror.samples) {
          const mb = mirrorBoxPx(refCam), o = NsArrows.arrowTipOutline(NsArrows.ARROW_DESIGN), grow = NsArrows.ARROW_LOOK.hoverScale;
          const mSize = NsArrows.arrowTipSizePx(cam, 'mirror');
          const pad = Math.max(o.halfAlong, o.halfAcross) * mSize * grow + 4;
          if (mb) mPad = { x0: mb.x0 - pad, y0: mb.y0 - pad, x1: mb.x1 + pad, y1: mb.y1 + pad };
          const fb = mirrorFrameBox(refCam, U, mSize), fr = fb ? NsArrows.frameRect(fb.box, NsArrows.FRAME_ASPECT.mirror, U, fb.keep) : null;
          if (fr) {
            const h = NsArrows.arrowHitHalfPx(mSize), ha = Math.max(h.halfAlongPx, o.halfAlong * mSize * grow), hc = Math.max(h.halfAcrossPx, o.halfAcross * mSize * grow);
            const mx = (fr.x0 + fr.x1) / 2, ty = Math.max(fr.y0, U.y0 + o.halfAlong * mSize * grow);
            mTop = { x0: mx - hc, y0: ty - ha, x1: mx + hc, y1: ty + ha };
          }
        }
        const bAvoid = (crossBox ? [crossBox] : []).concat(mTop ? [mTop] : []);
        B.plan = planFrame(B, { box: motorRestBoxPx(refCam), aspect: NsArrows.FRAME_ASPECT.brain, bounds: U, cam: refCam, centre: Array.from(centre), sizePx: bSize,
          avoid: bAvoid.length ? bAvoid : null, keepOut, rules: BRAIN_TIP_RULES,
          blocked: tipBlocker({ cam: refCam, centre: Array.from(centre), sizePx: bSize, box: mPad, grid: motorRestGrid(refCam) }) },
          { target: 'motor strip at rest', refLook: { yaw: arrowRef.yaw, pitch: arrowRef.pitch } });
        if (B.plan) B.plan.visAnchors = frameVisAnchors(B.plan, refCam, Array.from(centre)); // check fix: the frame FRAME_VIS samples
        B.frames = B.plan ? B.plan.frames : null;
        B.serial = (B.serial || 0) + 1;
        B.rig.setFrames(B.frames);
        arrowSerial++;
      }
    }
    B.shown = showB && Boolean(B.frames) && !B.frameHidden && arrowHeld !== 'brain';
    if (B.rig && B.rig.group.visible !== B.shown) B.rig.group.visible = B.shown;
    const showM = Boolean(M.rig) && mirrorRoot.visible && mirror.transform !== null && mirror.samples !== null && Boolean(mirror.body);
    if (showM) {
      // R558 (Message 19 check): planned on the body's place WITHOUT its moves along the ground (carryCentre), and the
      // key leaves the orbit out, so an arrow tap (a turn or a tilt) neither re-plans nor moves the tips; a carry or a
      // reset does.
      const c = mirror.transform.carryCentre || mirror.transform.centre;
      const key = `${view}|${c[0]},${c[1]},${c[2]}|${mirror.transform.scale}|${B.serial || 0}`;
      if ((key !== M.key || M.samplesRef !== mirror.samples) && (!arrowHeld || !M.key)) { // (not while an item is held: setHeldItem)
        M.key = key; M.samplesRef = mirror.samples;
        const start = { yaw: referenceAngles.yaw, pitch: referenceAngles.pitch };
        let look = start;
        const q = NsArrows.projectWorldPx(c, { width: cssW, height: cssH, fovYDeg: camera.fov, yaw: start.yaw, pitch: start.pitch, position: Array.from(eye) });
        if (!(q.depth > 0 && q.x > 0.1 * cssW && q.x < 0.9 * cssW && q.y > 0.1 * cssH && q.y < 0.9 * cssH)) {
          const v = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
          look = { yaw: Math.atan2(-v[0], -v[2]), pitch: Math.atan2(v[1], Math.hypot(v[0], v[2])) };
        }
        const refCam = { width: cssW, height: cssH, fovYDeg: camera.fov, yaw: look.yaw, pitch: look.pitch, position: Array.from(eye) };
        // the brain's tips come first: mirror tips that would overlap one move, as a pair, to the nearest clear place
        // (ns-arrows3d frameArrowSpots)
        const avoid = (B.plan && B.plan.anchors ? NsArrows.anchorBoxesPx(B.plan.anchors, { cam: refCam, sizePx: B.plan.sizes.sizePx }) : []).concat(crossBox ? [crossBox] : []);
        // R558 (issue hunt 2, portrait: the panels cover the mirror body's lower half, and the frame fitted to the
        // whole body then cut at the panels ringed only its head): the frame is built from the part of its on-screen box
        // inside the usable view (the space between the panels), padded by a tip so the tips sit just outside the body;
        // an axis that had to be cut is not grown again for the 9:16 shape (ns-arrows3d frameRect keep).
        const mSize = NsArrows.arrowTipSizePx(cam, 'mirror'), fb = mirrorFrameBox(refCam, U, mSize);
        const mBox = fb ? fb.box : null, keep = fb ? fb.keep : null;
        // R558 (hunt 2): a place your own body covers in this view is not taken (it would be hidden from the start,
        // FRAME_VIS); R558 (Message 31): the tips move in pairs to keep off it (tipBlocker, ns-arrows3d FRAME_PAIR).
        // R558 (Messages 55 / 56): nor a place over a motor area of the brain at rest (motorRestGrid).
        M.plan = planFrame(M, { box: mBox, keep, aspect: NsArrows.FRAME_ASPECT.mirror, bounds: U, cam: refCam, centre: Array.from(c), sizePx: mSize, avoid, keepOut,
          blocked: tipBlocker({ cam: refCam, centre: Array.from(c), sizePx: mSize, grid: showB ? motorRestGrid(refCam) : null }) },
          { target: 'mirror body', refLook: { yaw: look.yaw, pitch: look.pitch }, startLook: look === start, cutToView: keep });
        if (M.plan) M.plan.visAnchors = frameVisAnchors(M.plan, refCam, Array.from(c)); // check fix: the frame FRAME_VIS samples
        M.frames = M.plan ? M.plan.frames : null;
        M.serial = (M.serial || 0) + 1;
        M.rig.setFrames(M.frames);
        applyTipOcclusion(M); // check fix: setFrames shows every tip; the occluded ones stay hidden
        arrowSerial++;
      }
    }
    M.shown = showM && Boolean(M.frames) && !M.frameHidden && arrowHeld !== 'mirror';
    if (M.rig && M.rig.group.visible !== M.shown) M.rig.group.visible = M.shown;
    // R558 (Message 7): the planned anchors are fixed world points; each tip FACES the camera in use and keeps its
    // planned size on screen (ns-arrows3d facingArrowFrames: its depth axis along its own sight line, so the tilted solid
    // looks the same everywhere in the wide view). A tip fixed in the world and seen from the side, e.g. when the player
    // turns to look at a tip near the edge of the wide view, would be a thin sliver. Redone only when the camera or the plan
    // changed (eight small matrices); picks and screen boxes use these same frames.
    const faceCamKey = arrowCameraKey(cam);
    for (const set of [B, M]) {
      if (!set.shown || !set.plan || !set.plan.anchors) continue;
      const fk = `${faceCamKey}|${set.serial}`;
      if (fk === set.faceKey) continue;
      set.faceKey = fk;
      try { set.frames = NsArrows.facingArrowFrames(set.plan.anchors, { cam, sizePx: set.plan.sizes.sizePx, nearM: camera.near }); } catch (err) { arrowRigError = String((err && err.message) || err); }
      set.rig.setFrames(set.frames);
      applyTipOcclusion(set); // check fix: re-facing the tips to a moved camera must not show an occluded mirror tip again
      arrowSerial++;
    }
    // A normal pick can replan before the render/overlay pass. Refresh the SAME boxes/panel mask before it uses them.
    // No recursion: arrowScreenLayout -> arrowBoxes, and neither calls updateArrows. Unchanged cache inputs do no work.
    // R558: the brain's own matrix is part of the key, so a turned brain re-checks its arrows against the motor areas.
    const be = brainGroup.matrixWorld.elements;
    const maskKey = `${arrowCameraKey(cam)}|${arrowSerial}|${B.shown},${M.shown}|${arrowPanelObsKey}|${be[0]},${be[1]},${be[2]},${be[5]},${be[6]},${be[10]},${be[12]},${be[13]},${be[14]}`;
    if (maskKey !== arrowScreenMaskKey) {
      arrowScreenMaskKey = maskKey; arrowMaskCameraKey = arrowCameraKey(cam);
      if (B.shown) arrowScreenLayout(); else { underPanel.brain.clear(); arrowBoxes(); }
    }
  }
  /** Screen boxes (ns-arrows3d arrowScreenBox) and a click point (the point of the V, on the drawn stroke) of every shown arrow, for the
   * overlay, captions and QA; recomputed when the plan or the camera changed. */
  function arrowBoxes() {
    if (!(cssW > 0 && cssH > 0)) return;
    camera.updateMatrixWorld(true);
    const ce = camera.matrixWorld.elements;
    let ck = `${arrowSerial}|${cssW}x${cssH}|${camera.fov}|`;
    for (let i = 0; i < 16; i++) ck += `${ce[i]},`;
    const cam = arrowCam();
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
            const q = NsArrows.arrowClickPx(f, cam);
            click = q ? [q.x, q.y] : null;
          } catch { box = null; click = null; }
        }
        // R558 (hunt 2, FRAME_VIS): a tip your own body is in front of has no box (not drawn, no caption, no click).
        set.boxes[d] = box && box.x1 > 0 && box.x0 < cssW && box.y1 > 0 && box.y0 < cssH && !set.occluded.has(d) ? box : null;
        set.clicks[d] = set.boxes[d] ? click : null;
      }
      arrowStats.boxes++;
    }
  }
  /** R5-scene (D16 / D19): what a ray through CSS point (x, y) hits, nearest first: [{ kind: 'arrow', target: 'brain' |
   * 'mirror', dir, distance (m along the ray) }, { kind: 'brain', distance } (the point is inside the brain's drawn
   * outline; distance = its nearest point from the camera)] (ns-arrows3d pickArrows per rig, with its hit shape and
   * pick padding). Feed it to ns-controls resolveArrowHit.
   * R558 (Message 7): the V tips are drawn on top of everything, so a tip under the point always wins: over a motor
   * area (the motor area no longer takes priority over a brain tip) and over the glass (no 'brain' entry is reported
   * with a tip hit, so a mirror tip drawn over the brain is not 'blocked'). Away from the tips' hit shapes nothing
   * changes: the motor areas, the glass and the bodies keep their own picking. */
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
        const under = set.target === 'brain' ? underPanel.brain : null;
        // R558 (hunt 2, FRAME_VIS): a tip your own body is in front of answers no click either.
        const only = (under && under.size) || set.occluded.size ? ARROW_DIRS.filter(d => !(under && under.has(d)) && !set.occluded.has(d)) : null;
        try { h = only && !only.length ? null : NsArrows.pickArrows(ray, set.frames, only ? { only } : {}); } catch { h = null; }
        if (h && Number.isFinite(h.t)) hits.push({ kind: 'arrow', target: set.target, dir: h.dir, distance: h.t, onTip: h.dist <= 0 });
      }
      // R558 (Message 19 check): where a brain tip and a mirror tip lie close (third person, portrait), a point ON one
      // tip's hit shape wins over a tip it only reaches through the pick padding, even if that one is nearer.
      if (hits.length > 1 && hits.some(q => q.onTip)) for (let i = hits.length - 1; i >= 0; i--) if (!hits[i].onTip) hits.splice(i, 1);
    }
    if (!hits.length && regionMode && brainTransformSet && brainCoversRect({ x0: x - 0.5, y0: y - 0.5, x1: x + 0.5, y1: y + 0.5 })) {
      hits.push({ kind: 'brain', distance: Number.isFinite(cameraRange.brainNearM) ? cameraRange.brainNearM : arrowRef.dist });
    }
    hits.sort((p, q) => p.distance - q.distance);
    return hits;
  }
  /** R5-scene: highlight the arrow under the pick point. hit: { target, dir, blocked? } (ns-controls arrowHitOf /
   * stepArrowInput's hover) or null. An unblocked arrow gets ns-arrows3d's hover look (brighter, warm white, 10 % larger)
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
      // R558 (Message 7): a tip keeps its place on its frame and is drawn on top; its overlap with the motor areas as
      // drawn now is only recorded for the readback (a translucent tip over a motor area still shows the area).
      let overMotor = false;
      if (b && regionMode) { try { overMotor = motorCoversRect({ x0: b.x0 + motorCoverPadPx, y0: b.y0 + motorCoverPadPx, x1: b.x1 - motorCoverPadPx, y1: b.y1 - motorCoverPadPx }); } catch { overMotor = false; } }
      if (overMotor) overMotorNow.brain.add(d); else overMotorNow.brain.delete(d);
      const under = Boolean(b) && infoRects.some(r => b.x0 < r.x1 && b.x1 > r.x0 && b.y0 < r.y1 && b.y1 > r.y0);
      if (under) underPanel.brain.add(d); else underPanel.brain.delete(d);
      const root = B.rig && B.rig.arrows[d] ? B.rig.arrows[d].root : null;
      const hide = under || B.occluded.has(d); // R558 (hunt 2, FRAME_VIS): or your own body is in front of it
      if (root && root.visible === hide) root.visible = !hide;
      out[d] = b && !under ? { x: c ? c[0] : (b.x0 + b.x1) / 2, y: c ? c[1] : (b.y0 + b.y1) / 2, box: b } : null;
      if (out[d]) any = true;
    }
    return any ? out : null;
  }
  const underPanel = { brain: new Set() }; // R5-integrate-core: brain arrows hidden under the information panel this frame
  const overMotorNow = { brain: new Set() }; // R558: brain arrows whose box overlaps a motor area now (drawn under it)

  /* ---- R558 (hunt 2): tips behind your own body; sets whose target is mostly hidden or off screen (FRAME_VIS) ------ */
  // Your own body for the FRAME_VIS sight lines: the sphere cover the stop-at-contact rule already keeps of every drawn
  // body mesh and left-arm bone (collisionItems().own, ns-collide: a cover about 1 cm outside the surface), tested
  // coarse to fine (mesh bound, group spheres, leaf spheres). Much cheaper than the triangle picks (measured on the
  // first try with Three's triangle raycasts: 25 to 45 ms for 48 sight lines, far too slow for a check every few frames).
  const frameVis = { tick: 0, at: -1e9, key: '', runs: 0, rays: 0, lastMs: 0, lastRays: 0 };
  let ownPartIds = null, ownPartCount = -1;
  /** A sight-line tester for this pass: (x, y, maxM) -> true when your own body's cover lies on the sight line through
   * CSS point (x, y) nearer than maxM metres from the camera. In first person the head and neck (round the eye, not
   * drawn) are left out, and a hit counts only where the first-person view draws the body (FIRST_PERSON_BODY).
   * refCam (optional, a plain ns-arrows3d camera at the first-person eye): sight lines from that camera instead (tip
   * planning in the reference view; the head and neck are left out, the drawn-share rule is not applied).
   * R558 check (Message 31): with refCam, the left game arm's bones (part 'arm') are tested with the sight line through
   * the same pixel of the EYE as it looks now, not from the reference eye. The game arm hangs on the eye (eyeRig, camera
   * metres), so it keeps its place on screen whatever the look, while the rest of your body stays put in the world.
   * Tested from the reference eye, a plan made while you looked elsewhere saw the arm where THAT look put it (carrying
   * the brain while looking up at it: the arm high above its place in the start view), so the tips it judged clear sat
   * under your left hand again once you looked back (measured at 1600x900: the mirror body's left tip hidden, its right
   * tip shown alone; the brain's top and bottom tips shifted 228 px aside). The body's own muscles on the left upper arm
   * segment, which follow the game arm, are still tested from the reference eye (near the shoulder, rarely in front of
   * a tip). At the start look the eye and the reference eye coincide, so nothing changes there. */
  function ownSightTester(refCam = null) {
    const items = collisionItems(), own = items && items.own;
    if (!own || !own.entries.length) return () => false;
    if (!ownPartIds || ownPartCount !== body.length) {
      ownPartCount = body.length; ownPartIds = { head: new Set(), legs: new Set() };
      for (const b of body) {
        if (b.face || b.anatomicalPart === 'face' || b.anatomicalPart === 'neck') ownPartIds.head.add(b.id);
        if (b.anatomicalPart === 'legs') ownPartIds.legs.add(b.id);
      }
    }
    const fp = refCam ? true : !camState.headInPlace; // the camera at the eye: the head and neck round it are not drawn
    const entries = fp ? own.entries.filter(e => !(e.tag && e.tag.part === 'body' && ownPartIds.head.has(e.tag.id))) : own.entries;
    camera.updateMatrixWorld(true);
    const o = refCam ? Array.from(refCam.position) : [camera.position.x, camera.position.y, camera.position.z];
    const shareRule = fp && !refCam;
    // R558 check (Message 31): the eye as it looks now, for the game arm's sight lines in the reference view (see above)
    const eyeCam = refCam ? { width: refCam.width, height: refCam.height, fovYDeg: refCam.fovYDeg, yaw: lookYaw, pitch: lookPitch, position: [eyeRig.position.x, eyeRig.position.y, eyeRig.position.z] } : null;
    // nearest entry distance along the unit ray d from origin a of sphere (cx, cy, cz, r), or Infinity
    const hitT = (d, cx, cy, cz, r, a = o) => {
      const vx = cx - a[0], vy = cy - a[1], vz = cz - a[2], t = vx * d[0] + vy * d[1] + vz * d[2];
      const q = vx * vx + vy * vy + vz * vz - t * t;
      if (q > r * r) return Infinity;
      const th = t - Math.sqrt(r * r - q);
      return th < 0 ? (t + Math.sqrt(r * r - q) >= 0 ? 0 : Infinity) : th;
    };
    // R558 (performance, P3): what hitT computes from each entry's bounding sphere before the ray is known (the sphere
    // centre from the entry's ray origin, its squared length and the radius) is computed once per tester, in typed
    // arrays, with the same expressions in the same order; the per-ray test below is hitT's own arithmetic inlined, so
    // every answer is unchanged. The group and leaf spheres in the world are the entries' cached ones (ns-collide
    // entryGroups / entryLeaves: the same products as the inline transforms they replace).
    const nE = entries.length, pre = new Float64Array(5 * nE), isArm = new Uint8Array(nE);
    for (let i = 0; i < nE; i++) {
      const e = entries[i], arm = Boolean(eyeCam && e.tag && e.tag.part === 'arm'), a = arm ? eyeCam.position : o;
      const vx = e.c[0] - a[0], vy = e.c[1] - a[1], vz = e.c[2] - a[2];
      pre[5 * i] = vx; pre[5 * i + 1] = vy; pre[5 * i + 2] = vz; pre[5 * i + 3] = vx * vx + vy * vy + vz * vz; pre[5 * i + 4] = e.r;
      isArm[i] = arm ? 1 : 0;
    }
    // R558 (performance, P3): with a reference camera every sight line goes through a CSS pixel of that camera from its
    // eye, so each entry's bounding sphere can only be met by the pixels of its projected footprint. The footprints are
    // binned on a coarse pixel grid (built on the first sight line) and a sight line tests only the entries of its cell,
    // plus every entry whose footprint is not bounded (the game arm's bones, tested from the eye as it looks now; a
    // sphere round or near the eye or reaching beside or behind it); a pixel off the grid tests every entry. The
    // footprint is conservative: a unit sight line d that meets the sphere in front of the eye is within its angular
    // radius a = asin(r / |v|) of the sphere's direction u, so each camera-space component of d is within 2 sin(a / 2) <=
    // a of u's, and the pixel lies inside the box those component bounds give (grown by 1 % + 1e-9 rad and 2 px for
    // rounding). Every entry left out would fail hitT's first test, so the answer is unchanged (the reference-camera
    // test answers "any hit", in no particular order).
    let grid = null;
    const GRID_PX = 32;
    const buildGrid = () => {
      const F = NsArrows.cameraFrame(refCam), R = F.R, kx = F.tanH * F.aspect, ky = F.tanH;
      const nx = Math.max(1, Math.ceil(F.W / GRID_PX)), ny = Math.max(1, Math.ceil(F.H / GRID_PX));
      const cells = Array.from({ length: nx * ny }, () => []), always = [];
      for (let i = 0; i < nE; i++) {
        if (isArm[i]) { always.push(i); continue; }
        const vx = pre[5 * i], vy = pre[5 * i + 1], vz = pre[5 * i + 2], r = pre[5 * i + 4], dist = Math.sqrt(pre[5 * i + 3]);
        if (!(dist > r + 1e-3) || !Number.isFinite(dist)) { always.push(i); continue; }
        const ux = (R[0][0] * vx + R[1][0] * vy + R[2][0] * vz) / dist, uy = (R[0][1] * vx + R[1][1] * vy + R[2][1] * vz) / dist, uz = (R[0][2] * vx + R[1][2] * vy + R[2][2] * vz) / dist;
        const dl = Math.asin(Math.min(1, r / dist)) * 1.01 + 1e-9;
        if (!(uz + dl < -1e-3)) { always.push(i); continue; }
        const zn = -(uz - dl), zf = -(uz + dl); // -d_z lies in [zf, zn], zf > 0
        const xs = [(ux - dl) / zn, (ux - dl) / zf, (ux + dl) / zn, (ux + dl) / zf], ys = [(uy - dl) / zn, (uy - dl) / zf, (uy + dl) / zn, (uy + dl) / zf];
        const px0 = (Math.min(...xs) / kx + 1) * 0.5 * F.W - 2, px1 = (Math.max(...xs) / kx + 1) * 0.5 * F.W + 2;
        const py0 = (1 - Math.max(...ys) / ky) * 0.5 * F.H - 2, py1 = (1 - Math.min(...ys) / ky) * 0.5 * F.H + 2;
        if (![px0, px1, py0, py1].every(Number.isFinite)) { always.push(i); continue; }
        const cx0 = Math.max(0, Math.floor(px0 / GRID_PX)), cx1 = Math.min(nx - 1, Math.floor(px1 / GRID_PX));
        const cy0 = Math.max(0, Math.floor(py0 / GRID_PX)), cy1 = Math.min(ny - 1, Math.floor(py1 / GRID_PX));
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) cells[cy * nx + cx].push(i);
      }
      const all = Int32Array.from({ length: nE }, (_, i) => i);
      return { nx, ny, W: F.W, H: F.H, cells: cells.map(c => Int32Array.from(always.concat(c))), all };
    };
    const rayDir = refCam ? NsArrows.pixelRayDirFn(refCam) : null;
    const eyeRayDir = eyeCam ? NsArrows.pixelRayDirFn(eyeCam) : null;
    return (x, y, maxM) => {
      if (!(maxM > 0)) return false;
      frameVis.rays++; frameVis.lastRays++;
      let d, dEye = null, list = null;
      if (refCam) {
        d = rayDir(x, y);
        if (!grid) grid = buildGrid();
        const cx = Math.floor(x / GRID_PX), cy = Math.floor(y / GRID_PX);
        list = x >= 0 && y >= 0 && x < grid.W && y < grid.H && cx < grid.nx && cy < grid.ny ? grid.cells[cy * grid.nx + cx] : grid.all;
      } else {
        pv.set((x / cssW) * 2 - 1, 1 - (y / cssH) * 2, 0.5).unproject(camera);
        const dl = Math.hypot(pv.x - o[0], pv.y - o[1], pv.z - o[2]);
        if (!(dl > 0)) return false;
        d = [(pv.x - o[0]) / dl, (pv.y - o[1]) / dl, (pv.z - o[2]) / dl];
      }
      for (let li = 0, nL = list ? list.length : nE; li < nL; li++) {
        const ei = list ? list[li] : li;
        let dd = d, a = o;
        if (isArm[ei]) { if (!dEye) dEye = eyeRayDir(x, y); dd = dEye; a = eyeCam.position; }
        {
          const p = 5 * ei, r = pre[p + 4], t = pre[p] * dd[0] + pre[p + 1] * dd[1] + pre[p + 2] * dd[2];
          const q = pre[p + 3] - t * t;
          if (q > r * r) continue;
          const th = t - Math.sqrt(r * r - q);
          if (!((th < 0 ? (t + Math.sqrt(r * r - q) >= 0 ? 0 : Infinity) : th) < maxM)) continue;
        }
        const e = entries[ei], G = e.table.groups, Gw = NsCollide.entryGroups(e);
        for (let i = 0, gi = 0; i < G.length; i += 6, gi++) {
          if (!(hitT(dd, Gw[4 * gi], Gw[4 * gi + 1], Gw[4 * gi + 2], Gw[4 * gi + 3], a) < maxM)) continue;
          const Lw = NsCollide.entryLeaves(e, gi);
          for (let j = 0; j < Lw.length; j += 4) {
            const t = hitT(dd, Lw[j], Lw[j + 1], Lw[j + 2], Lw[j + 3], a);
            if (!(t < maxM)) continue;
            if (shareRule && e.tag && e.tag.part === 'body' && firstPersonShareAt(o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2], ownPartIds.legs.has(e.tag.id)) < FIRST_PERSON_BODY.pickFrom) continue;
            return true;
          }
        }
      }
      return false;
    };
  }
  /** Check fix (hunt 2, FRAME_VIS): the mirror body's tips that your own body is in front of stay hidden. rig.setFrames
   * shows every tip that has a frame, and the tips are faced to the camera (setFrames) again whenever the camera moves,
   * so without this an occluded tip came back on the next look movement, drawn on your body but answering no click
   * (seen in third person: the mirror body's left tip on your right shoulder). The brain's tips get the same rule in
   * arrowScreenLayout (with the under-panel rule). */
  function applyTipOcclusion(set) {
    if (!set || set.target !== 'mirror' || !set.rig) return;
    for (const d of ARROW_DIRS) {
      const a = set.rig.arrows[d];
      if (!a) continue;
      const want = Boolean(set.frames && set.frames[d]) && !set.occluded.has(d);
      if (a.root.visible !== want) a.root.visible = want;
    }
  }
  /** Check fix (hunt 2, FRAME_VIS): the world side middles of a plan's frame (plan.rect, planned in the reference view
   * `cam` round `centre`), taken BEFORE any tip slides along its side; FRAME_VIS samples this frame. */
  function frameVisAnchors(plan, cam, centre) {
    const r = plan && plan.rect;
    if (!r || ![r.x0, r.y0, r.x1, r.y1].every(Number.isFinite)) return null;
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    try { return NsArrows.frameArrowAnchors({ left: { x: r.x0, y: cy }, right: { x: r.x1, y: cy }, forward: { x: cx, y: r.y0 }, back: { x: cx, y: r.y1 } }, { cam, centre }); } catch { return null; }
  }
  /** R558 (hunt 2, FRAME_VIS): decide which tips are drawn and answer clicks. Runs before updateArrows in render(), at
   * most every FRAME_VIS.everyFrames frames while the camera, a pose, a plan or a target changed. */
  function stepArrowVisibility() {
    if (!(cssW > 0 && cssH > 0)) return;
    frameVis.tick++;
    const cam = arrowCam(), be = brainGroup.matrixWorld.elements;
    const key = `${arrowCameraKey(cam)}|${arrowSerial}|${bodyPoseSerial}|${armPoseSerial}|${mirror.serial}|${camState.headInPlace}|${be[12]},${be[13]},${be[14]}`;
    if (key === frameVis.key || frameVis.tick - frameVis.at < FRAME_VIS.everyFrames) return;
    const t0 = nowMs();
    frameVis.key = key; frameVis.at = frameVis.tick; frameVis.runs++; frameVis.lastRays = 0;
    let test = null;
    const covered = (x, y, m) => { if (!test) test = ownSightTester(); return test(x, y, m); };
    let changed = false;
    for (const set of [arrowSets.brain, arrowSets.mirror]) {
      if (set.target === arrowHeld) continue; // R558 (performance): a held item's arrows are not drawn (setHeldItem)
      const A = set.plan && set.plan.anchors;
      const targetOn = set.target === 'brain' ? brainGroup.visible && brainTransformSet : mirrorRoot.visible && mirror.transform !== null;
      let hide = false;
      const occ = new Set();
      let vis = null;
      // the frame's own side middles (planned frame, before any tip slid along its side; frameVisAnchors), else the tips
      const F = set.plan && set.plan.visAnchors && ARROW_DIRS.every(d => set.plan.visAnchors[d]) ? set.plan.visAnchors : A;
      if (set.rig && A && targetOn && ARROW_DIRS.every(d => A[d])) {
        // the frame in the world: the plane rectangle through the four side middles of the planned frame (the left /
        // right ones span its width, the top / bottom ones its height), sampled on a gridX x gridY grid of cell centres;
        // a sample counts as seen when it lies in front of the camera, inside the view and with no part of your own body
        // nearer than the target's centre on its sight line. (Sampling the world rectangle, not its projected box, keeps
        // a frame that reaches behind the camera, e.g. the brain's when you turn far to one side, counted fairly.)
        // Check fix (hunt 2): the frame, not the tips: a tip slid along its side (off your hand, off the mirror body)
        // tilted and shifted the sampled rectangle toward your hands and legs, so a mirror body plainly in view lost its
        // tips (share 0.125 at a 6-degree look down with the trunk leaning back).
        const L = F.left, R = F.right, T = F.forward, Bm = F.back;
        const C0 = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2, (L[2] + R[2]) / 2];
        const hx = [(R[0] - L[0]) / 2, (R[1] - L[1]) / 2, (R[2] - L[2]) / 2], hy = [(T[0] - Bm[0]) / 2, (T[1] - Bm[1]) / 2, (T[2] - Bm[2]) / 2];
        const c = set.target === 'brain' ? (farEyeView.pw || [be[12], be[13], be[14]]) : mirror.transform.centre;
        const cd = Math.hypot(c[0] - cam.position[0], c[1] - cam.position[1], c[2] - cam.position[2]);
        let n = 0, on = 0, seen = 0;
        for (let i = 0; i < FRAME_VIS.gridX; i++) for (let j = 0; j < FRAME_VIS.gridY; j++) {
          n++;
          const u = (2 * (i + 0.5)) / FRAME_VIS.gridX - 1, v = (2 * (j + 0.5)) / FRAME_VIS.gridY - 1;
          const q = NsArrows.projectWorldPx([C0[0] + u * hx[0] + v * hy[0], C0[1] + u * hx[1] + v * hy[1], C0[2] + u * hx[2] + v * hy[2]], cam);
          if (!(q.depth > camera.near && q.x >= 0 && q.x <= cssW && q.y >= 0 && q.y <= cssH)) continue;
          on++;
          if (!covered(q.x, q.y, cd)) seen++;
        }
        const share = seen / n;
        hide = share < FRAME_VIS.minShare;
        vis = { share: Math.round(share * 1000) / 1000, onScreen: Math.round((on / n) * 1000) / 1000, bodyCovered: on ? Math.round(((on - seen) / on) * 1000) / 1000 : 0 };
        if (!hide) {
          // each tip: its middle and its two sides across its pointing direction; your body in front on two of three
          const h = 0.35 * (set.plan.sizes && Number.isFinite(set.plan.sizes.sizePx) ? set.plan.sizes.sizePx : 40);
          for (const d of ARROW_DIRS) {
            const a = A[d], q = NsArrows.projectWorldPx(a, cam), e = NsArrows.COMPASS_SCREEN[d];
            if (!(q.depth > camera.near)) continue;
            const dist = Math.hypot(a[0] - cam.position[0], a[1] - cam.position[1], a[2] - cam.position[2]);
            const ax = e[0] === 0 ? h : 0, ay = e[0] === 0 ? 0 : h;
            let k = 0, done = 0;
            for (const s of [0, -1, 1]) { done++; if (covered(q.x + s * ax, q.y + s * ay, dist)) k++; if (k >= 2 || k + (3 - done) < 2) break; }
            if (k >= 2) occ.add(d);
          }
          if (occ.size) vis.occluded = [...occ];
        }
      }
      const sameOcc = occ.size === set.occluded.size && [...occ].every(d => set.occluded.has(d));
      if (hide !== set.frameHidden || !sameOcc) {
        set.frameHidden = hide; set.occluded = occ; changed = true;
        applyTipOcclusion(set);
      }
      set.vis = vis;
    }
    if (changed) { arrowSerial++; overlayDirty = true; }
    frameVis.lastMs = Math.round((nowMs() - t0) * 100) / 100;
  }
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
      // R558 (Message 7): never on top of ANY shown tip (the two sets' tips can be near each other), its own first.
      const tipBoxes = [box];
      for (const st of [arrowSets.brain, arrowSets.mirror]) if (st.shown) for (const dd of ARROW_DIRS) { const b2 = st.boxes[dd]; if (b2 && b2 !== box) tipBoxes.push(b2); }
      // R558 (issue hunt 2, portrait third person: "Slide the mirror body away from you" covered the "Right arm" label):
      // nor on the region labels shown last frame or the orientation labels.
      for (let i = 0; i < labelEls.length; i++) { const L = labelEls[i], b = labelBoxes[i]; if (L.shownNow && b && !b.skip) tipBoxes.push({ x0: b.x - b.w / 2, y0: b.y - b.h / 2, x1: b.x + b.w / 2, y1: b.y + b.h / 2 }); }
      if (orientLive) for (const r of orientLive) tipBoxes.push(r);
      const hitsBox = (x, y) => tipBoxes.some(b2 => x < b2.x1 + 2 && x + w > b2.x0 - 2 && y < b2.y1 + 2 && y + h > b2.y0 - 2);
      // just past the arrow's outer end along its compass direction; where the screen edge, the panel or another tip
      // leaves no room there: under the arrow (above it for the bottom arrow), then beside it, never on top of a tip
      const cx = (box.x0 + box.x1) / 2 - w / 2, cy = (box.y0 + box.y1) / 2 - h / 2;
      const spots = [[e[0] > 0 ? box.x1 + gap : e[0] < 0 ? box.x0 - gap - w : cx, e[1] > 0 ? box.y1 + gap : e[1] < 0 ? box.y0 - gap - h : cy],
        [cx, e[1] > 0 ? box.y0 - gap - h : box.y1 + gap], [cx, box.y0 - gap - h], [box.x1 + gap, cy], [box.x0 - gap - w, cy]]
        .map(([sx, sy]) => [clampTo(sx, 4, xMax), clampTo(sy, topPx, yMax)]);
      let [x, y] = spots.find(([sx, sy]) => !hitsBox(sx, sy)) || spots[0];
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
      brain: one(arrowSets.brain), mirror: one(arrowSets.mirror), stats: { ...arrowStats },
      // R558 (hunt 2, FRAME_VIS): what the visibility rule decided last and what it cost
      visibility: { brain: { hidden: arrowSets.brain.frameHidden, occluded: [...arrowSets.brain.occluded], ...(arrowSets.brain.vis || {}) },
        mirror: { hidden: arrowSets.mirror.frameHidden, occluded: [...arrowSets.mirror.occluded], ...(arrowSets.mirror.vis || {}) },
        runs: frameVis.runs, rays: frameVis.rays, lastRays: frameVis.lastRays, lastMs: frameVis.lastMs } };
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
          : set.plan && set.plan.stable ? 'RETAINED_LOOK_INDEPENDENT_PLAN_R558'
          : set.planningCameraKey !== activeKey || set.planningTargetKey !== arrowTargetKey(set.target)
            || set.planningEvidence.source.key !== arrowSourceRecord(set.target).key ? 'STALE' : 'RETAINED_CURRENT_KEYS',
        currentEligibility: arrowEligibility(set.target), currentSource: arrowSourceRecord(set.target),
        currentTargetKey: arrowTargetKey(set.target), currentCameraKey: activeKey,
        retained: set.planningEvidence ? copyCompassEvidence(set.planningEvidence) : null,
        scope: 'Same ordinary invocation; no getter refresh. Current keys are not an atomic render/pixel or source-file identity.' },
      planningOutcome: set.planningOutcome || 'not-planned', planningError: set.planningError || null,
      frame: set.frameRecord ? copyCompassEvidence(set.frameRecord) : null,
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
            boxOverlapsMotorArea: set.target === 'brain' ? overMotorNow.brain.has(d) : false,
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
      // R558 (hunt 2, FRAME_VIS): the last visibility decision (retained data only; nothing is recomputed here)
      visibility: { brain: { shown: arrowSets.brain.shown, hidden: arrowSets.brain.frameHidden, occluded: [...arrowSets.brain.occluded], ...(arrowSets.brain.vis ? copyCompassEvidence(arrowSets.brain.vis) : {}) },
        mirror: { shown: arrowSets.mirror.shown, hidden: arrowSets.mirror.frameHidden, occluded: [...arrowSets.mirror.occluded], ...(arrowSets.mirror.vis ? copyCompassEvidence(arrowSets.mirror.vis) : {}) },
        runs: frameVis.runs, rays: frameVis.rays, lastRays: frameVis.lastRays, lastMs: frameVis.lastMs },
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
        // R558 (performance, P2): the same values in the same order, the same Math.min / Math.max and the same refusal,
        // with the running bounds in local variables (the per-vertex skinned twins are rescanned every dance frame);
        // a plain xyz Float32 buffer takes the shared box of its current vertices (liveBoxOf: the same Math.min / Math.max
        // over the same values; a NaN or infinite coordinate leaves a bound that is not finite, which is refused as before).
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        if (attr.array instanceof Float32Array && attr.itemSize === 3 && !attr.isInterleavedBufferAttribute) {
          const lb = liveBoxOf(attr);
          if (attr.count > 0 && !(Number.isFinite(lb.x0) && Number.isFinite(lb.y0) && Number.isFinite(lb.z0) && Number.isFinite(lb.x1) && Number.isFinite(lb.y1) && Number.isFinite(lb.z1))) fail('scene_input', 'nonfinite full or live mirror position');
          x0 = lb.x0; y0 = lb.y0; z0 = lb.z0; x1 = lb.x1; y1 = lb.y1; z1 = lb.z1;
        } else {
          const A = attr.array, n3 = 3 * attr.count;
          for (let k = 0; k < n3; k += 3) {
            const x = A[k], y = A[k + 1], z = A[k + 2];
            if (!Number.isFinite(x)) fail('scene_input', 'nonfinite full or live mirror position');
            x0 = Math.min(x0, x); x1 = Math.max(x1, x);
            if (!Number.isFinite(y)) fail('scene_input', 'nonfinite full or live mirror position');
            y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            if (!Number.isFinite(z)) fail('scene_input', 'nonfinite full or live mirror position');
            z0 = Math.min(z0, z); z1 = Math.max(z1, z);
          }
        }
        box = { lo: [x0, y0, z0], hi: [x1, y1, z1], array: attr.array, count: attr.count, version: attr.version, sharedAttribute, sharedVersion };
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
  // R558 (performance): each twin's eight world corners are kept while its world matrix and both of its position
  // buffers (object, array, count, version) are unchanged, so a dance or a look re-reads only the twins that moved (the
  // head, an arm, a leg); the radius about the centre and the camera depths are taken over all corners on each call.
  // Same numbers as reading every mesh each time.
  const envTwins = new WeakMap(), envCorners = new Float64Array(24);
  function currentMirrorEnvelope() {
    if (!mirrorRoot.visible || !mirror.transform) return null;
    camera.updateMatrixWorld(true); mirrorRoot.updateMatrixWorld(true); // force: every twin's matrixWorld is current
    const centre = mirror.transform.centre, V = camera.matrixWorldInverse.elements;
    const kids = mirrorBodyGroup.children.concat(mirrorArmGroup.children);
    let radiusM = 0, minCameraDepthM = Infinity, maxCameraDepthM = -Infinity, positions = 0;
    const meshes = kids.length;
    for (const mesh of kids) {
      const full = mesh.userData.nsFullGeometry || mesh.geometry;
      const fa = full && full.attributes && full.attributes.position, la = mesh.geometry && mesh.geometry.attributes && mesh.geometry.attributes.position;
      const M = mesh.matrixWorld.elements;
      let rec = envTwins.get(mesh);
      let same = Boolean(rec) && rec.fa === fa && rec.la === la && Boolean(fa) && Boolean(la) && rec.faArr === fa.array && rec.laArr === la.array
        && rec.faN === fa.count && rec.laN === la.count && rec.faV === fa.version && rec.laV === la.version;
      for (let i = 0; same && i < 16; i++) if (rec.m[i] !== M[i]) same = false;
      if (!same) {
        // R558 (P2): a twin's record is refilled in place (its corner and matrix arrays reused) once the corners are
        // all found; the same numbers.
        const c = envCorners;
        let k = 0;
        const n = mirrorMeshCorners(mesh, mesh.matrixWorld, (x, y, z) => { c[k++] = x; c[k++] = y; c[k++] = z; });
        if (rec) {
          rec.c.set(c); rec.m.set(M); rec.n = n;
          rec.fa = fa; rec.la = la; rec.faArr = fa.array; rec.laArr = la.array; rec.faN = fa.count; rec.laN = la.count; rec.faV = fa.version; rec.laV = la.version;
        } else {
          rec = { fa, la, faArr: fa.array, laArr: la.array, faN: fa.count, laN: la.count, faV: fa.version, laV: la.version, m: Float64Array.from(M), c: Float64Array.from(c), n };
          envTwins.set(mesh, rec);
        }
      }
      positions += rec.n;
      const P = rec.c;
      for (let i = 0; i < 24; i += 3) {
        // R558 (P2): Math.hypot only for a corner that can be the farthest so far (a sum of squares below
        // radius^2 (1 - 1e-9) means Math.hypot < radius: the running maximum is unchanged, bit for bit).
        const ex = P[i] - centre[0], ey = P[i + 1] - centre[1], ez = P[i + 2] - centre[2];
        if (!(radiusM > 1e-100 && ex * ex + ey * ey + ez * ez < radiusM * radiusM * (1 - 1e-9))) {
          const r = Math.hypot(ex, ey, ez);
          if (r > radiusM) radiusM = r;
        }
        const depth = -(V[2] * P[i] + V[6] * P[i + 1] + V[10] * P[i + 2] + V[14]);
        if (!Number.isFinite(depth)) fail('scene_input', 'nonfinite current mirror depth');
        if (depth < minCameraDepthM) minCameraDepthM = depth;
        if (depth > maxCameraDepthM) maxCameraDepthM = depth;
      }
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
      // R558: push it away ALONG THE GROUND (the camera's forward with its vertical part removed), so a held mirror
      // body never leaves the ground; a horizontal step gains cos(pitch) of view depth per metre.
      const C = camera.matrixWorld.elements, hx = -C[8], hz = -C[10], hl = Math.hypot(hx, hz);
      const along = Math.max(0.1, hl), ux = hl > 1e-9 ? hx / hl : 0, uz = hl > 1e-9 ? hz / hl : 0;
      mirror.worldCentre = [mirror.worldCentre[0] + ux * shift / along, mirror.worldCentre[1], mirror.worldCentre[2] + uz * shift / along];
      if (!applyMirror()) fail('scene_input', 'current mirror placement application failed');
      envelope = currentMirrorEnvelope();
    }
    if (!(envelope.minCameraDepthM >= camera.near)) fail('scene_input', 'bounded strict current mirror near-plane check failed');
    return { status: 'current-pose-near-checked', movementWorldM: mirror.worldCentre.map((x, i) => x - before[i]), worldCentreM: mirror.worldCentre.slice(), envelope,
      scope: 'Object translation only before render; no active-camera switch. Released placement never silently moved. Refusal is a failed/unresolved ordinary pose, not working R22 acceptance.' };
  }

  /** The player's posed body as world points (the 8 box corners of every body mesh in its posed place, head included,
   * and of every arm bone and muscle as drawn) -> ns-mirror bodyBoundsFromPoints; measured from the first posed body
   * and again at a reset of the mirror body. R558: the plane of the literal reflection is set from this measurement
   * (setMirrorPlane); it does not depend on the brain. */
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
    setMirrorPlane();
    return true;
  }
  /** R558: the drawn meshes of one body ('own': your body and arm; 'mirror': their twins) with the matrix from their
   * vertex buffer to the world (body meshes: posed source mm -> world m; arm: the drawn eye-frame arm -> world). */
  function bodyMeshesFor(which) {
    const out = [];
    if (which === 'mirror') {
      mirrorRoot.updateMatrixWorld(true);
      for (const b of body) if (b.mirror) out.push({ mesh: b.mirror, world: b.mirror.matrixWorld, arm: false });
      for (const b of bones) if (b.mirror) out.push({ mesh: b.mirror, world: b.mirror.matrixWorld, arm: true });
      for (const m of muscles) if (m.mirror) out.push({ mesh: m.mirror, world: m.mirror.matrixWorld, arm: true });
      return out;
    }
    bodyGroup.updateMatrixWorld(true);
    eyeRig.updateMatrixWorld(true);
    const bw = bodyGroup.matrixWorld;
    for (const b of body) out.push({ mesh: b.mesh, world: new THREE.Matrix4().multiplyMatrices(bw, b.mesh.matrix), arm: false });
    for (const b of bones) out.push({ mesh: b.mesh, world: b.mesh.matrixWorld, arm: true });
    for (const m of muscles) out.push({ mesh: m.mesh, world: m.mesh.matrixWorld, arm: true });
    return out;
  }
  /** R558: extremes of one drawn body on its REAL vertices (no box corners): the largest distance along the unit
   * horizontal `forward` from `eye`, the lowest and the highest point (world y), the head top (the highest point of the
   * body meshes, without the left arm drawn by the arm rig) and the largest / smallest elevation angle seen from `eye`
   * (which drawn points are highest / lowest on the screen for a look straight at them), each with its point. Only meshes whose
   * box corners come within `margin` of an extreme are read vertex by vertex, so this costs a few ms; called when the
   * plane is set and for the QA report (cached), never per frame. */
  function drawnBodyExtremes(which, eye, forward, margin = 0.25, want = { fore: true, low: true, high: true }) {
    const list = bodyMeshesFor(which);
    let foreBound = -Infinity, lowBound = Infinity, highBound = -Infinity;
    const boxes = list.map(e => {
      let fore = -Infinity, low = Infinity, high = -Infinity;
      mirrorMeshCorners(e.mesh, e.world, (x, y, z) => {
        const a = (x - eye[0]) * forward[0] + (y - eye[1]) * forward[1] + (z - eye[2]) * forward[2];
        if (a > fore) fore = a; if (y < low) low = y; if (y > high) high = y;
      });
      if (fore > foreBound) foreBound = fore; if (low < lowBound) lowBound = low; if (high > highBound) highBound = high;
      return { ...e, fore, low, high };
    });
    let foremostM = -Infinity, foremostPoint = null, lowestM = Infinity, lowestPoint = null, highestM = -Infinity, highestPoint = null, read = 0, vertices = 0;
    let headTopM = -Infinity, headTopPoint = null, elevMax = -Infinity, elevMaxPoint = null, elevMin = Infinity, elevMinPoint = null;
    for (const e of boxes) {
      const wantFore = want.fore && e.fore >= foreBound - margin, wantLow = want.low && e.low <= lowBound + margin, wantHigh = want.high && e.high >= highBound - margin;
      if (!wantFore && !wantLow && !wantHigh) continue;
      const attr = e.mesh.geometry && e.mesh.geometry.attributes && e.mesh.geometry.attributes.position;
      if (!attr || !(attr.count > 0)) continue;
      const a = attr.array, w = e.world.elements;
      read++;
      for (let i = 0; i < attr.count; i++) {
        const sx = a[3 * i], sy = a[3 * i + 1], sz = a[3 * i + 2];
        const x = w[0] * sx + w[4] * sy + w[8] * sz + w[12], y = w[1] * sx + w[5] * sy + w[9] * sz + w[13], z = w[2] * sx + w[6] * sy + w[10] * sz + w[14];
        if (wantFore) { const f = (x - eye[0]) * forward[0] + (y - eye[1]) * forward[1] + (z - eye[2]) * forward[2]; if (f > foremostM) { foremostM = f; foremostPoint = [x, y, z]; } }
        if (wantLow && y < lowestM) { lowestM = y; lowestPoint = [x, y, z]; }
        if (wantHigh && y > highestM) { highestM = y; highestPoint = [x, y, z]; }
        if (wantHigh && !e.arm && y > headTopM) { headTopM = y; headTopPoint = [x, y, z]; }
        const el = Math.atan2(y - eye[1], Math.hypot(x - eye[0], z - eye[2]));
        if (el > elevMax) { elevMax = el; elevMaxPoint = [x, y, z]; }
        if (el < elevMin) { elevMin = el; elevMinPoint = [x, y, z]; }
      }
      vertices += attr.count;
    }
    return { foremostM, foremostPoint, lowestM, lowestPoint, highestM, highestPoint, headTopM, headTopPoint, elevMax, elevMaxPoint, elevMin, elevMinPoint,
      foreBoxM: foreBound, lowBoxM: lowBound, meshesRead: read, vertices };
  }
  /** R558: set the plane of the literal reflection from the posed body: vertical, square to the body's forward axis,
   * MIRROR_REFLECTION.clearanceM in front of the foremost drawn point measured from the eye. The plane then stays fixed
   * in the world (like a mirror on a stand) until the next reset; the orbit (turn / push) and the carry start again
   * from it. */
  function setMirrorPlane() {
    if (!mirror.body) return false;
    try {
      const eye = [eyeRig.position.x, eyeRig.position.y, eyeRig.position.z];
      const f = mirror.body.forward;
      const t0 = nowMs();
      // Only the foremost point sets the plane: read just the meshes whose box comes within 5 cm of it.
      const ex = drawnBodyExtremes('own', eye, [f[0], 0, f[2]], 0.05, { fore: true, low: false, high: false });
      // R558 (Message 12: your body and the mirror body never touch): the plane stands in front of the farthest point your
      // body can ever REACH with every joint in range (setMirrorReach, measured by the app: the legs with the toes pointed,
      // the hands), not only of the start pose, so no reachable pose ever meets its own reflection.
      const drawnF = Number.isFinite(ex.foremostM) ? ex.foremostM : null, reachF = Number.isFinite(mirror.reachForemostM) ? mirror.reachForemostM : null;
      const foremostM = drawnF === null ? reachF : reachF === null ? drawnF : Math.max(drawnF, reachF);
      mirror.placement = NsMirror.mirrorReflectionPlacement({ body: mirror.body, eye, foremostM, reach: mirror.reachSphere });
      mirror.measured = { ms: Math.round((nowMs() - t0) * 10) / 10, foremostPointM: ex.foremostPoint, drawnForemostM: drawnF, reachForemostM: reachF, meshesRead: ex.meshesRead, vertices: ex.vertices, bodyPoseSerial, armPoseSerial };
      mirror.state = mirror.state ? NsMirror.placeMirror(mirror.state, mirror.placement) : NsMirror.createMirrorState(mirror.placement);
      mirror.planeSerial++;
    } catch (err) { mirror.error = String((err && err.message) || err); return false; }
    applyMirror();
    return true;
  }
  /** The transform in use: an integrator's ns-mirror transform or state (setMirrorView), else the scene's default state
   * with its orbit (turn and push) and carried place. */
  function applyMirror() {
    let T = null;
    try {
      if (mirror.external && mirror.external.kind === 'ns-mirror-transform') T = mirror.external;
      else if (mirror.external && mirror.external.kind === 'ns-mirror-state' && mirror.external.placement) T = NsMirror.mirrorTransform(Object.freeze({ ...mirror.external, viewAwayM: mirror.viewAwayM }));
      else if (mirror.state) T = NsMirror.mirrorTransform(Object.freeze({ ...mirror.state, placement: mirrorPlacementNow(), orbit: Object.freeze({ yaw: mirror.orbit.yaw, pitch: mirror.orbit.pitch, push: mirror.orbit.push }), viewAwayM: mirror.viewAwayM }));
    } catch (err) { mirror.error = String((err && err.message) || err); T = null; }
    if (!T || !T.matrix || T.matrix.length !== 16) return false;
    // R558 (Message 12): the stop-at-contact correction (setMirrorCorrection) rides on top of the placement.
    mirror.pipelineMatrix = Array.from(T.matrix);
    mirror.pipelineCarryCentre = T.carryCentre ? Array.from(T.carryCentre) : Array.from(T.centre);
    const C = mirror.correction || null;
    const matrix = C ? Array.from(NsCollide.mul(C, T.matrix)) : Array.from(T.matrix), centre = C ? NsCollide.apply(C, T.centre[0], T.centre[1], T.centre[2]) : Array.from(T.centre);
    mirrorRoot.matrix.fromArray(matrix);
    mirrorRoot.matrixWorldNeedsUpdate = true;
    mirror.transform = { matrix, centre, carryCentre: T.carryCentre ? (C ? NsCollide.apply(C, T.carryCentre[0], T.carryCentre[1], T.carryCentre[2]) : Array.from(T.carryCentre)) : centre.slice(), push: Number.isFinite(T.push) ? T.push : 0,
      tiltAwayM: Number.isFinite(T.tiltAwayM) ? T.tiltAwayM : 0, reachAwayM: Number.isFinite(T.reachAwayM) ? T.reachAwayM : 0, standBackM: Number.isFinite(T.standBackM) ? T.standBackM : 0, scale: T.scale, det: T.det, orbit: T.orbit ? { yaw: T.orbit.yaw, pitch: T.orbit.pitch, push: Number.isFinite(T.orbit.push) ? T.orbit.push : 0 } : null };
    mirror.serial++;
    overlayDirty = true;
    updateCameraRange();
    return true;
  }
  /** R558: true when the mirror body is untouched (no turn, no push, not carried, no handed state): it must then be the
   * literal reflection, exactly. */
  const mirrorAtRest = () => !mirror.external && !mirror.worldCentre && !mirror.correction && mirror.orbit.yaw === 0 && mirror.orbit.pitch === 0 && mirror.orbit.push === 0;
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
   *    own placement is then used with the state's orbit and carried place) or an ns-mirror TRANSFORM: used as given;
   *  - { orbit: { yaw, pitch, push } } or { yawDeg, pitchDeg, pushM } (ns-mirror convention: yaw > 0 = viewpoint to the
   *    right, pitch > 0 = viewpoint up, inside +-MIRROR_ORBIT.pitchLimitDeg, push > 0 = farther along the ground) for
   *    the scene's own state; a value left out keeps what it was;
   *  - { visible: false | true } shows or hides it (an Esc option, if any); null resets it.
   * R558: a state or null that brings a moved mirror body back to rest (resetMirror) is a reset: the plane is set again
   * from the posed body at the next frame, and the mirror body is the literal reflection again.
   * It never turns or moves by itself. Returns { serial, ready } (R558, performance: it used to return the whole
   * mirrorState() report, which projects every body sample and builds the motor areas' occupancy grid, on every call;
   * the app called it on every frame of a carry and never read it. Ask mirrorState() for the report). */
  function setMirrorView(v = null) {
    const wasAtRest = mirrorAtRest();
    if (v && Object.prototype.hasOwnProperty.call(v, 'worldCentre')) {
      const p = v.worldCentre;
      if (p !== null && (!p || p.length !== 3 || !Array.from(p).every(Number.isFinite))) fail('scene_input', 'normal mirror placement needs finite world metres');
      mirror.worldCentre = p === null ? null : Array.from(p);
    }
    const pitchLimit = NsMirror.MIRROR_ORBIT.pitchLimitDeg;
    const orbitOf = o => ({ yaw: o && Number.isFinite(o.yaw) ? o.yaw : 0, pitch: o && Number.isFinite(o.pitch) ? Math.max(-pitchLimit, Math.min(pitchLimit, o.pitch)) + 0 : 0, push: o && Number.isFinite(o.push) ? Math.max(0, Math.min(NsMirror.MIRROR_ORBIT.push.maxM, o.push)) : 0 });
    if (v === null) { mirror.external = null; mirror.worldCentre = null; mirror.orbit = orbitOf(null); }
    else if (v && (v.kind === 'ns-mirror-transform' || v.kind === 'ns-mirror-state')) {
      if (v.kind === 'ns-mirror-state' && !v.placement) { mirror.external = null; mirror.orbit = orbitOf(v.orbit); }
      else mirror.external = v;
    } else if (v && typeof v === 'object') {
      const o = v.orbit && typeof v.orbit === 'object' ? v.orbit : v;
      const yaw = Number.isFinite(o.yaw) ? o.yaw : Number.isFinite(o.yawDeg) ? o.yawDeg : null;
      const push = Number.isFinite(o.push) ? o.push : Number.isFinite(o.pushM) ? o.pushM : null;
      const pitch = Number.isFinite(o.pitch) ? o.pitch : Number.isFinite(o.pitchDeg) ? o.pitchDeg : null;
      if (yaw !== null || push !== null || pitch !== null) { mirror.external = null; mirror.orbit = orbitOf({ yaw: yaw !== null ? yaw : mirror.orbit.yaw, pitch: pitch !== null ? pitch : mirror.orbit.pitch, push: push !== null ? push : mirror.orbit.push }); }
      if (typeof v.visible === 'boolean') mirror.enabled = v.visible;
    } else fail('scene_input', 'setMirrorView needs an ns-mirror state / transform, an orbit object or null');
    // A reset (moved -> rest): measure the posed body again and set the plane from it at the next frame.
    if (!wasAtRest && mirrorAtRest() && mirror.ready) mirror.ready = false;
    applyMirror();
    return { serial: mirror.serial, ready: mirror.ready };
  }
  /** The scene's current default ns-mirror placement (or null), with the carried place when the mirror body has been
   * carried, so an integrator can keep its own state in step: NsMirror.placeMirror(state, scene.mirrorPlacementNow()).
   * R558: the placement is in world metres (the plane is set from world points and the eye), so no reference frame is
   * composed into it. */
  function mirrorPlacementNow() {
    if (!mirror.placement) return mirror.placement;
    return mirror.worldCentre ? Object.freeze({ ...mirror.placement, worldCentre: Object.freeze(mirror.worldCentre.slice()) }) : mirror.placement;
  }
  /** R558 QA, only on request (inspect({ mirrorCheck: true }); cached; tens of ms when the pose, the look or the mirror
   * changed): the lowest drawn point of your body and of the mirror
   * body on their real vertices (the same flat ground), and the drawn left hand: yours, its exact reflection through
   * the mirror matrix and the mirror twin's own hand (the twin's world matrix as drawn), so a difference between what
   * you are shown and its mirror image would be seen in millimetres. */
  let mirrorCheckCache = null, mirrorCheckKey = '';
  function mirrorBodyCheck() {
    if (!mirror.transform || !mirror.body) return null;
    const key = `${mirror.serial}|${bodyPoseSerial}|${armPoseSerial}|${lookYaw},${lookPitch}|${eyeRig.position.x},${eyeRig.position.y},${eyeRig.position.z}`;
    if (mirrorCheckCache && key === mirrorCheckKey) return mirrorCheckCache;
    const M = mirror.transform.matrix, f = mirror.body.forward, eye = [eyeRig.position.x, eyeRig.position.y, eyeRig.position.z];
    // img: the image's extremes with forward reversed, so its 'foremost' is its nearest point toward you.
    const own = drawnBodyExtremes('own', eye, [f[0], 0, f[2]]), img = drawnBodyExtremes('mirror', eye, [-f[0], 0, -f[2]]);
    const at = (m, c) => { pv.copy(c).applyMatrix4(m); return [pv.x, pv.y, pv.z]; };
    const refl = p => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];
    const mm = v => Math.round(v * 1e4) / 10;
    const arm = {};
    mirrorRoot.updateMatrixWorld(true); eyeRig.updateMatrixWorld(true);
    for (const seg of ['upperarm', 'forearm', 'hand', 'middle_dp']) {
      const b = bones.find(x => x.segment === seg);
      const g = b && (b.mesh.userData.nsFullGeometry || b.mesh.geometry);
      if (!b || !b.mirror || !g) continue;
      if (!g.boundingSphere && typeof g.computeBoundingSphere === 'function') g.computeBoundingSphere();
      if (!g.boundingSphere) continue;
      b.mesh.updateMatrixWorld(true);
      const o = at(b.mesh.matrixWorld, g.boundingSphere.center), r = refl(o), t = at(b.mirror.matrixWorld, g.boundingSphere.center);
      arm[seg] = { ownM: o.map(v => Math.round(v * 1e4) / 1e4), reflectedM: r.map(v => Math.round(v * 1e4) / 1e4), mirrorM: t.map(v => Math.round(v * 1e4) / 1e4), diffMm: mm(Math.hypot(t[0] - r[0], t[1] - r[1], t[2] - r[2])) };
    }
    // Elevation of the drawn left arm (upper-arm centre -> hand centre) above the horizontal, yours and the twin's.
    const elev = (a, b) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; return Math.round(Math.asin(d[1] / Math.hypot(...d)) / DEG * 10) / 10; };
    if (arm.upperarm && arm.hand) arm.elevationDeg = { own: elev(arm.upperarm.ownM, arm.hand.ownM), mirror: elev(arm.upperarm.mirrorM, arm.hand.mirrorM) };
    mirrorCheckCache = {
      ground: { ownLowestM: Math.round(own.lowestM * 1e5) / 1e5, mirrorLowestM: Math.round(img.lowestM * 1e5) / 1e5, diffMm: mm(Math.abs(img.lowestM - own.lowestM)), ownLowestPointM: own.lowestPoint && own.lowestPoint.map(v => Math.round(v * 1e4) / 1e4), mirrorLowestPointM: img.lowestPoint && img.lowestPoint.map(v => Math.round(v * 1e4) / 1e4) },
      foremost: { ownM: Math.round(own.foremostM * 1e4) / 1e4, ownPointM: own.foremostPoint && own.foremostPoint.map(v => Math.round(v * 1e4) / 1e4), mirrorNearestM: Math.round(-img.foremostM * 1e4) / 1e4, gapMm: mm(-img.foremostM - own.foremostM) },
      upright: { yRow: [M[1], M[5], M[9]], yColumn: [M[4], M[5], M[6]], tilted: !(M[1] === 0 && M[9] === 0 && M[4] === 0 && M[6] === 0 && M[5] === 1) },
      leftArm: arm, meshesRead: own.meshesRead + img.meshesRead, onScreen: null
    };
    // Where the image lands on the screen now (share of the view height from the top): its head top, its highest and
    // lowest drawn points as seen from the eye (largest / smallest elevation angle), and the downward look that would
    // centre those two vertically (mean of the two elevation angles; exact for points on the view's vertical midline).
    if (cssW > 0 && cssH > 0 && img.elevMaxPoint && img.elevMinPoint) {
      camera.updateMatrixWorld(true);
      const yFrac = p => { if (!p) return null; pv.set(p[0], p[1], p[2]).applyMatrix4(camera.matrixWorldInverse); if (pv.z > -camera.near) return null; pv.applyMatrix4(camera.projectionMatrix); return Math.round((1 - pv.y) * 0.5 * 1000) / 1000; };
      const r4 = p => p && p.map(v => Math.round(v * 1e4) / 1e4), deg = a => Math.round(a / DEG * 100) / 100;
      mirrorCheckCache.onScreen = { headTopYFrac: yFrac(img.headTopPoint), topYFrac: yFrac(img.elevMaxPoint), bottomYFrac: yFrac(img.elevMinPoint),
        headTopPointM: r4(img.headTopPoint), topPointM: r4(img.elevMaxPoint), bottomPointM: r4(img.elevMinPoint), topElevationDeg: deg(img.elevMax), bottomElevationDeg: deg(img.elevMin),
        centringPitchDeg: deg((img.elevMax + img.elevMin) / 2), headTopToBottomCentringPitchDeg: img.headTopPoint ? deg((Math.atan2(img.headTopPoint[1] - eye[1], Math.hypot(img.headTopPoint[0] - eye[0], img.headTopPoint[2] - eye[2])) + img.elevMin) / 2) : null,
        lookDeg: { yaw: deg(lookYaw), pitch: deg(lookPitch) }, fovYDeg: camera.fov };
    }
    mirrorCheckKey = key;
    return mirrorCheckCache;
  }
  /** QA: the mirror body's state, its measured on-screen box (CSS px; the projected body sample) and the share of those
   * points inside the brain's drawn outline (coveredByBrain). R558: the plane of the literal reflection, the matrix in
   * use (full precision) and, while the mirror body is untouched, how far it is from the pure reflection. opts.check true
   * adds the vertex-level check (mirrorBodyCheck: same ground, the drawn left arm and its mirror image, where the image
   * lands on screen). */
  function mirrorState(opts = {}) {
    const T = mirror.transform, Pl = mirror.placement;
    const rest = mirrorAtRest();
    const restDiff = T && Pl && Pl.matrix ? NsMirror.matrixMaxDiff(T.matrix, Pl.matrix) : null;
    const out = { source: 'ns-mirror', enabled: mirror.enabled, ready: mirror.ready, visible: mirrorRoot.visible, error: mirror.error, twins: mirror.twins, armTwins: bones.length + muscles.length,
      carriedPlacement: { carryHeldAtReconcile: typeof mirror.carryHeldAtReconcile === 'boolean' ? mirror.carryHeldAtReconcile : null, worldCentreM: mirror.worldCentre ? mirror.worldCentre.slice() : null, actualCentreWorldM: T ? T.centre.slice() : null, carryCentreWorldM: T ? T.carryCentre.slice() : null },
      external: mirror.external ? mirror.external.kind : null,
      orbit: T && T.orbit ? { yawDeg: T.orbit.yaw, pitchDeg: T.orbit.pitch, pushM: T.orbit.push, tiltAwayM: Number.isFinite(T.tiltAwayM) ? T.tiltAwayM : 0, reachAwayM: Number.isFinite(T.reachAwayM) ? T.reachAwayM : 0, standBackM: Number.isFinite(T.standBackM) ? T.standBackM : 0 }
        : { yawDeg: mirror.orbit.yaw, pitchDeg: mirror.orbit.pitch, pushM: mirror.orbit.push, tiltAwayM: 0, reachAwayM: 0, standBackM: 0 },
      scale: T ? T.scale : null, centre: T ? T.centre.map(v => Math.round(v * 1000) / 1000) : null, determinant: T ? T.det : null,
      matrix: T ? T.matrix.slice() : null,
      reflection: Pl && Pl.plane ? { rule: Pl.rule, normal: Pl.plane.normal.slice(), offsetM: Pl.plane.offsetM, eyeM: Pl.plane.eyeM.slice(), distanceM: Pl.plane.distanceM, foremostM: Pl.plane.foremostM, boxForemostM: Pl.plane.boxForemostM, clearanceM: Pl.plane.clearanceM,
        drawnForemostM: mirror.measured && Number.isFinite(mirror.measured.drawnForemostM) ? mirror.measured.drawnForemostM : null, reachForemostM: Number.isFinite(mirror.reachForemostM) ? mirror.reachForemostM : null, // R558 (Message 12)
        reach: Pl.reach ? { centreM: Pl.reach.centre.slice(), radiusM: Pl.reach.radiusM } : null, // R558 (Message 45): the reach sphere a turned body stands back for
        pureMatrix: Pl.matrix.slice(), atRest: rest, restMaxDiff: rest ? restDiff : null, tolerance: NsMirror.MIRROR_REFLECTION.matrixTolerance, planeSerial: mirror.planeSerial, measured: mirror.measured } : null,
      body: mirror.body ? { heightM: Math.round(mirror.body.height * 1000) / 1000, radiusM: Math.round(mirror.body.radius * 1000) / 1000, points: mirror.body.count } : null,
      lodCellMm: mirror.lod || 0, lodPending: mirrorLodPending, lodBuildMs: Number.isFinite(mirror.lodBuildMs) ? Math.round(mirror.lodBuildMs) : 0, behindGlass: { applied: behindGlass.applied, amount: behindGlass.amount, brainNearM: behindGlass.nearM }, onScreen: null, check: null };
    // The vertex-level check reads real vertices (25 to 50 ms after a look change): only on an explicit request
    // (ns-app inspect({ mirrorCheck: true })), never in an ordinary state read, so a QA loop does not slow the game.
    if (opts && opts.check === true) { try { out.check = mirrorBodyCheck(); } catch (err) { out.check = { error: String((err && err.message) || err) }; } }
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
      if (n) out.onScreen = { box: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)], heightPx: Math.round(y1 - y0), heightFrac: Math.round(((y1 - y0) / cssH) * 1000) / 1000, topFrac: Math.round((y0 / cssH) * 1000) / 1000, bottomFrac: Math.round((y1 / cssH) * 1000) / 1000, coveredByBrain: Math.round((inBrain / n) * 1000) / 1000, behindMotor: grid ? Math.round((behindMotor / n) * 1000) / 1000 : null, samples: n };
    }
    return out;
  }
  /** R5-camera (round5/R5-camera-NOTES.md 4.3): keep-out spheres [{ centre: [x, y, z], radius }] (world m) of your body
   * for the third-person boom (ns-camera cameraPose opts.avoid): one per body mesh (head and face IN PLACE: body frame x
   * mesh matrix), one per arm bone and one per arm muscle (from its CPU-skinned points). Cached until the body pose, the
   * arm pose, the body frame or the look changes. */
  let keepOutCache = null, keepOutKey = '';
  // R558 (performance): the body's spheres depend only on the body pose and frame, the arm's also on the look (the arm
  // hangs on the eye), so the body part is kept while only the look or the arm changes (third-person look). Same spheres.
  let keepOutBody = null, keepOutBodyKey = '';
  function bodyKeepOut() {
    const key = `${bodyPoseSerial}|${lastMatrices ? armPoseSerial : 0}|${lookYaw},${lookPitch}|${bodyFrame.join(',')}`;
    if (keepOutCache && key === keepOutKey) return keepOutCache;
    bodyGroup.updateMatrixWorld(true);
    eyeRig.updateMatrixWorld(true);
    const bodyKey = `${bodyPoseSerial}|${bodyFrame.join(',')}|${body.length}`;
    if (!keepOutBody || bodyKey !== keepOutBodyKey) {
      keepOutBody = [];
      const bw = bodyGroup.matrixWorld, col = Math.hypot(bw.elements[0], bw.elements[1], bw.elements[2]) || 0.001;
      for (const b of body) {
        const g = b.mesh.userData.nsFullGeometry || b.mesh.geometry, gs = g.boundingSphere;
        if (!gs) continue;
        pv.copy(gs.center).applyMatrix4(b.mesh.matrix).applyMatrix4(bw);
        keepOutBody.push({ centre: [pv.x, pv.y, pv.z], radius: gs.radius * col });
      }
      keepOutBodyKey = bodyKey;
    }
    const out = keepOutBody.slice();
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
      // R558 (performance, P2): the radius depends only on the skinned vertices and their centre (arm frame), not on
      // the look: kept while the centre (recomputed per arm pose) and the buffer (version) are the same; a look in third
      // person only moves the centre into the world below.
      let r = 0;
      if (m.keepR && m.keepR.c === c && m.keepR.p === p && m.keepR.v === m.posAttr.version) r = m.keepR.r;
      else {
        // Math.hypot only where it can raise the running maximum (a sum of squares below r^2 (1 - 1e-9) cannot; a NaN
        // still reaches Math.max): the same radius bit for bit.
        for (let i = 0; i < n; i += step) {
          const dx = p[3 * i] - c[0], dy = p[3 * i + 1] - c[1], dz = p[3 * i + 2] - c[2];
          if (r > 1e-100 && dx * dx + dy * dy + dz * dz < r * r * (1 - 1e-9)) continue;
          r = Math.max(r, Math.hypot(dx, dy, dz));
        }
        m.keepR = { c, p, v: m.posAttr.version, r };
      }
      pv.set(c[0], c[1], c[2]).applyMatrix4(armGroup.matrixWorld);
      out.push({ centre: [pv.x, pv.y, pv.z], radius: r * 1.02 });
    }
    keepOutCache = out; keepOutKey = key;
    return out;
  }
  /** R5-scene (D19): the mirror-body part under CSS point (x, y): { elementId, bodyPart, kind, side (YOUR side: -1 left,
   * +1 right, 0 midline; ns-mirror MIRROR_TEXT names it "your ... (mirror image)"), name, distance, behindBrain } or null.
   * A ray against the mirror twins (a few ms: call it throttled, like raycastBrain). behindBrain: the brain's drawn
   * outline covers the point AND the hit lies beyond the brain's nearest point (R558: the literal reflection stands in
   * front of the brain at the start, where the outline covers it but no glass is in front of it). */
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
      name: String(o.name || '').replace(/^mirror image: /, ''), distance: hits[0].distance,
      behindBrain: covered && !(Number.isFinite(cameraRange.brainNearM) && hits[0].distance < cameraRange.brainNearM) };
  }

  /** R558 (user Messages 33 and 34: "You should be able to grasp-move items even if they are behind another item." ...
   * "Same for the other controls of course."): everything a ray through CSS point (x, y) meets, nearest first, as the
   * controls see it. { layers, mirror } or null:
   *  - layers: [{ item: 'brain', kind: 'area' (a motor area: regionId) | 'glass' (the clear glass) | 'outline' (inside
   *    the brain's drawn outline where the ray meets no brain surface, a concavity; the old conservative input blocker),
   *    distance (m), point ([x, y, z] world m or null) } | { item: 'own' | 'mirror', kind: 'muscle' | 'bone', distance,
   *    point, rec: { source, part: 'body' | 'arm', kind, id (atlas element id), name, side (-1 your left, +1 your right,
   *    0 middle), bodyPart, armKey } }], one entry per mesh (its nearest DRAWN hit: a part of your own body that the
   *    ordinary first-person view does not draw is passed through, FIRST_PERSON_BODY, as a click always did). The orbit
   *    arrows are not in the list (pickArrows: they are drawn on top of everything).
   *  - mirror: { centreWorldM (the carry's centre, without the slide), radiusM, mirrorEnvelope } while the mirror body is
   *    shown, else null (what a carry of the mirror body starts from).
   * Which of these a control acts on (what you see, or the item behind it) is the app's rule (ns-app controlTargets).
   * Only meshes drawn now are tested; the left arm's CPU-skinned muscles get fresh bounding spheres first. A mirror-body
   * hit names the same anatomical part as on your own body (the mirror copies you, it does not swap left and right). */
  let musclePickIndex = null, musclePickCount = -1;
  function bodyPickIndex() {
    if (!musclePickIndex || musclePickCount !== body.length + bones.length + muscles.length) {
      musclePickIndex = new Map(); musclePickCount = body.length + bones.length + muscles.length;
      const clean = n => String(n || '').replace(/^mirror image: /, '').replace(/ \[[^\]]*\]$/, '').replace(/ \([A-Za-z0-9-]+\)$/, '');
      for (const b of body) {
        const rec = { part: 'body', kind: b.kind, id: b.id, name: clean(b.mesh.name), side: b.side, bodyPart: b.anatomicalPart || b.part, armKey: null };
        if (!b.face) musclePickIndex.set(b.mesh, { ...rec, source: 'own' });
        if (b.inPlace) musclePickIndex.set(b.inPlace, { ...rec, source: 'own' });
        if (b.mirror) musclePickIndex.set(b.mirror, { ...rec, source: 'mirror' });
      }
      for (const b of bones) {
        const rec = { part: 'arm', kind: 'bone', id: b.sourceElementId, name: clean(b.mesh.name), side: -1, bodyPart: 'leftArm', armKey: null };
        musclePickIndex.set(b.mesh, { ...rec, source: 'own' });
        if (b.mirror) musclePickIndex.set(b.mirror, { ...rec, source: 'mirror' });
      }
      for (const m of muscles) {
        const rec = { part: 'arm', kind: 'muscle', id: m.id, name: clean(m.mesh.name), side: -1, bodyPart: 'leftArm', armKey: m.key };
        musclePickIndex.set(m.mesh, { ...rec, source: 'own' });
        if (m.mirror) musclePickIndex.set(m.mirror, { ...rec, source: 'mirror' });
      }
    }
    return musclePickIndex;
  }
  function controlLayersAt(x, y) {
    if (!(cssW > 0 && cssH > 0 && Number.isFinite(x) && Number.isFinite(y))) return null;
    const index = bodyPickIndex();
    // The world matrices as the renderer will use them (it updates the same way); the brain and the mirror body forced, as
    // their picks always were (their matrices are set directly), then the camera's own.
    scene.updateMatrixWorld(); brainGroup.updateMatrixWorld(true); mirrorRoot.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    pv.set((x / cssW) * 2 - 1, 1 - (y / cssH) * 2, 0.5).unproject(camera);
    rayDir.copy(pv).sub(camera.position).normalize(); rayOrigin.copy(camera.position); raycaster.set(rayOrigin, rayDir);
    // The left arm is skinned on the CPU: its bounding spheres are brought up to date first, so a moved muscle is found.
    for (const m of muscles) { try { computeSphereExact(m.mesh.geometry); } catch { /* keep the old sphere */ } } // R558 (P2): Three's sphere, exact
    const shown = o => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
    const targets = [];
    for (const o of index.keys()) if (shown(o)) targets.push(o);
    const brainOn = brainGroup.visible;
    if (brainOn) for (const o of rayTargets || glass) if (shown(o)) targets.push(o);
    const hits = raycaster.intersectObjects(targets, false);
    // R558 (FIRST_PERSON_BODY): a part of your own body that the ordinary view does not draw is not seen; the ray goes on
    // to whatever is drawn behind it.
    const hiddenOwn = h => { const r = index.get(h.object); return Boolean(r) && r.source === 'own' && r.part === 'body' && firstPersonShareAt(h.point.x, h.point.y, h.point.z, r.bodyPart === 'legs') < FIRST_PERSON_BODY.pickFrom; };
    let pool = hits;
    if (firstPersonUniform.value.w > 0) {
      // Review fix: the pick trees give only the NEAREST hit of each mesh. When that hit is on a part the ordinary view
      // does not draw, the same mesh may still have a drawn part farther along the ray (a rib or a muscle that wraps
      // round the body). Ask Three for every hit of that one mesh and keep its first drawn one.
      const extra = [];
      for (const h of hits) {
        if (!hiddenOwn(h)) continue;
        const all = [];
        THREE.Mesh.prototype.raycast.call(h.object, raycaster, all);
        all.sort((a, b) => a.distance - b.distance);
        const next = all.find(a => a.distance > h.distance + 1e-6 && !hiddenOwn(a));
        if (next) extra.push(next);
      }
      if (extra.length) pool = hits.concat(extra).sort((a, b) => a.distance - b.distance);
    }
    const layers = [], seen = new Set();
    for (const h of pool) {
      if (seen.has(h.object)) continue;
      const r = index.get(h.object);
      if (r) {
        if (hiddenOwn(h)) continue;
        seen.add(h.object);
        layers.push({ item: r.source, kind: r.kind, distance: h.distance, point: h.point.toArray(), rec: { ...r } });
        continue;
      }
      seen.add(h.object);
      const u = h.object.userData || {}, regionId = typeof u.regionId === 'string' ? u.regionId : null;
      const area = regionId !== null || Boolean(!regionMode && strip && h.object === strip.mesh);
      layers.push({ item: 'brain', kind: area ? 'area' : 'glass', distance: h.distance, point: h.point.toArray(), regionId });
    }
    if (brainOn && regionMode && brainTransformSet && !layers.some(l => l.item === 'brain') && brainCoversRect({ x0: x - 0.5, y0: y - 0.5, x1: x + 0.5, y1: y + 0.5 })) {
      // Inside the brain's drawn outline where the ray meets none of its surfaces (a concavity): the brain still catches
      // the press there unless something is seen in front of it, as before (its conservative input outline), placed
      // where the ray enters the brain's box (or at the brain's nearest point).
      let entry = Number.isFinite(cameraRange.brainNearM) ? cameraRange.brainNearM : 0;
      if (brainDepthBounds) {
        brainGroup.updateMatrixWorld(true);
        const inverse = NsMirror.invertAffine(Array.from(brainGroup.matrixWorld.elements));
        const o = NsMath.transformPoint(inverse, [rayOrigin.x, rayOrigin.y, rayOrigin.z]);
        const d = NsMath.transformDirection(inverse, [rayDir.x, rayDir.y, rayDir.z]);
        let a0 = 0, a1 = Infinity, meets = true;
        for (let j = 0; j < 3; j++) {
          if (d[j] === 0) { if (o[j] < brainDepthBounds.min[j] || o[j] > brainDepthBounds.max[j]) meets = false; continue; }
          const a = (brainDepthBounds.min[j] - o[j]) / d[j], b = (brainDepthBounds.max[j] - o[j]) / d[j];
          a0 = Math.max(a0, Math.min(a, b)); a1 = Math.min(a1, Math.max(a, b));
        }
        // An affine map keeps the ray parameter, so a0 (found in the brain's own frame) is metres along the world ray.
        if (meets && a1 >= a0) entry = a0;
      }
      layers.push({ item: 'brain', kind: 'outline', distance: entry, point: [rayOrigin.x + rayDir.x * entry, rayOrigin.y + rayDir.y * entry, rayOrigin.z + rayDir.z * entry], regionId: null });
      layers.sort((p, q) => p.distance - q.distance);
    }
    let mirrorInfo = null;
    if (mirrorRoot.visible && mirror.transform && mirror.body) {
      const env = currentMirrorEnvelope();
      // R558: the carry moves the centre WITHOUT the push (the push slides along the ground on top of where it is carried).
      if (env) mirrorInfo = { centreWorldM: (mirror.transform.carryCentre || mirror.transform.centre).slice(), radiusM: env.radiusM, mirrorEnvelope: env };
    }
    return { layers, mirror: mirrorInfo };
  }

  /** R558 (genuine note R31: "if we tap on the body, on any muscles, those muscles will activate"): the nearest body
   * part seen along a ray through CSS point (x, y), on your own body (trunk, legs, right arm, the in-place head seen
   * from behind, the left arm) or on the mirror body: the first body entry of controlLayersAt. The brain's CLEAR GLASS is
   * see-through (a body part behind it is what you see); null when nothing is hit or a MOTOR AREA of the brain is nearer
   * along the same ray (a click on a motor area belongs to that area). Returns { ...rec, distance } (controlLayersAt).
   * R558 (Messages 33 and 34): the controls now read controlLayersAt themselves (what is seen, or the item behind it);
   * this is the same answer as before for what is seen. */
  function muscleAt(x, y) {
    const L = controlLayersAt(x, y);
    if (!L) return null;
    for (const l of L.layers) {
      if (l.item === 'brain') { if (l.kind === 'area') return null; continue; }
      return { ...l.rec, distance: l.distance };
    }
    return null;
  }

  /** R22 normal crosshair pick: { target: 'brain' | 'mirror' | null, blocked, pointWorldM?, centreWorldM?, radiusM?,
   * mirrorEnvelope, source }. Compass arrows block (an arrow tip under the point is an arrow press). R558 (Messages 33
   * and 34): the brain's clear glass no longer blocks the mirror body behind it: the nearest of the two that is SEEN wins
   * (a motor area is seen; clear glass is seen only when nothing of the mirror body lies behind it); your own body is not
   * an item here (ns-app controlTargets handles it). */
  function graspTargetAt(x, y) {
    if (!(cssW > 0 && cssH > 0 && Number.isFinite(x) && Number.isFinite(y))) return { target: null, blocked: 'unavailable-viewport' };
    const arrows = pickArrows(x, y);
    if (arrows.some(h => h.kind === 'arrow')) return { target: null, blocked: 'orbit-arrow' };
    const L = controlLayersAt(x, y);
    if (!L) return { target: null, blocked: 'unavailable-viewport' };
    const env = L.mirror ? L.mirror.mirrorEnvelope : null;
    let seenGlass = null;
    for (const l of L.layers) {
      if (l.item === 'own') continue;
      if (l.item === 'brain' && l.kind !== 'area') { if (!seenGlass) seenGlass = l; continue; }
      if (l.item === 'mirror' && L.mirror) return { target: 'mirror', blocked: null, centreWorldM: L.mirror.centreWorldM.slice(), radiusM: L.mirror.radiusM, pointWorldM: l.point, mirrorEnvelope: env, source: 'seen-mirror-ray-r558' };
      if (l.item === 'brain') return { target: 'brain', blocked: null, pointWorldM: l.point, mirrorEnvelope: env, source: 'seen-brain-ray-r558' };
    }
    if (seenGlass) return { target: 'brain', blocked: null, pointWorldM: seenGlass.point, mirrorEnvelope: env, source: 'seen-brain-glass-r558' };
    return { target: null, blocked: null, mirrorEnvelope: env };
  }

  /* ---- R558 (user Message 12): the three items as sets of spheres (ns-collide) -------------------------------------- */
  // "Ensure that your body, the brain and the mirror do not touch or collide ... they can be moved to and around each
  // other but not through." Each drawn mesh gets a sphere table once (cached by geometry; rebuilt, a few meshes per call,
  // when its vertices are rewritten, e.g. by the Body Worlds lift). collisionItems() gives the three items with the
  // world matrices as drawn now; the app decides what may move (it only reads). Your own body: every body mesh where it
  // is drawn (the head and face IN PLACE, not the face layer at the eye) and the left arm's bones with a pad for the
  // muscle round them (its muscles are skinned on the CPU every frame); the mirror body: the same tables through the
  // twins' matrices; the brain: its glass meshes.
  const collideTables = new WeakMap();
  let collideRebuilds = 0, collidePass = 0;
  function collideTable(geo, kind) {
    const pos = geo && geo.attributes && geo.attributes.position;
    if (!pos || !(pos.count > 0) || !pos.array) return null;
    let t = collideTables.get(geo);
    if (t && (t.version === pos.version || collideRebuilds >= 24)) return t.table;
    collideRebuilds++;
    const table = kind === 'brain'
      ? NsCollide.sphereTable(pos.array.length === pos.count * 3 ? pos.array : Float32Array.from({ length: pos.count * 3 }, (_, i) => pos.getComponent(Math.floor(i / 3), i % 3)), { leaf: NsCollide.COLLIDE.brainLeafMm, group: NsCollide.COLLIDE.brainGroupMm })
      : NsCollide.sphereTable(pos.array.length === pos.count * 3 ? pos.array : Float32Array.from({ length: pos.count * 3 }, (_, i) => pos.getComponent(Math.floor(i / 3), i % 3)), { leaf: NsCollide.COLLIDE.bodyLeafMm, group: NsCollide.COLLIDE.bodyGroupMm });
    t = { table, version: pos.version, pass: collidePass };
    collideTables.set(geo, t);
    return table;
  }
  /* R558 (the right forearm skinned per vertex): in the Space dance 36 body meshes are rewritten every frame, more than
   * the 24 tables a pass may rebuild, and the loop below always met them in the same order, so the last 12 kept the
   * table of the pose the dance started from for as long as it lasted. The pass now spends its rebuilds on the stale
   * body tables oldest first (same budget; when 24 or fewer are stale every one is rebuilt, exactly as before). */
  function collideRebuildOldest() {
    const stale = [];
    for (const b of body) {
      const src = b.face ? b.inPlace : b.mesh;
      const geo = src ? (src.userData.nsFullGeometry || src.geometry) : null, pos = geo && geo.attributes && geo.attributes.position;
      const t = pos ? collideTables.get(geo) : null;
      if (t && t.version !== pos.version) stale.push(t.pass, stale.length / 3, geo);
    }
    if (stale.length <= 3 * 24) return;
    const order = [];
    for (let i = 0; i < stale.length; i += 3) order.push(i);
    order.sort((x, y) => stale[x] - stale[y] || stale[x + 1] - stale[y + 1]);
    for (let j = 0; j < 24; j++) collideTable(stale[order[j] + 2], 'body');
  }
  let collideCache = null, collideKey = '';
  // R558 (performance): entries carried over from the last build when their table, pad and matrix are unchanged, so
  // the items rebuilt on every frame of a dance or a look keep their cached world spheres (only moved meshes are new).
  let collideEntries = new Map();
  /** { own, mirror (null when not shown), brain (null when not shown), bodyFrame, mirrorMatrix, brainMatrix, brainSolid } with
   * ns-collide items; own / mirror entries carry tags { id (atlas element id), part 'body' | 'arm' }. Cached until a pose,
   * the look, the body frame, the mirror or the brain changes. */
  function collisionItems() {
    const bm = brainGroup.matrix.elements, mm = mirrorRoot.matrix.elements;
    const key = `${bodyPoseSerial}|${armPoseSerial}|${lookYaw},${lookPitch}|${eyeRig.position.x},${eyeRig.position.y},${eyeRig.position.z}|${bodyFrame.join(',')}|${mirror.serial}|${mirrorRoot.visible}|${brainGroup.visible}|${Array.prototype.join.call(bm, ',')}|${Array.prototype.join.call(mm, ',')}|${body.length},${bones.length},${glass.length}`;
    if (collideCache && key === collideKey) return collideCache;
    collideRebuilds = 0; collidePass++;
    collideRebuildOldest();
    bodyGroup.updateMatrixWorld(true); eyeRig.updateMatrixWorld(true); brainGroup.updateMatrixWorld(true); mirrorRoot.updateMatrixWorld(true);
    const own = [], twin = [], brainEntries = [];
    const nextEntries = new Map();
    const reuse = (obj, t, m, pad, tag) => {
      const old = collideEntries.get(obj);
      if (old && old.table === t && old.pad === pad && old.tag === tag) {
        let same = true;
        for (let i = 0; i < 16; i++) if (old.m[i] !== m[i]) { same = false; break; }
        if (same) { nextEntries.set(obj, old); return old; }
      }
      const e = NsCollide.entry(t, m, pad, tag);
      nextEntries.set(obj, e);
      return e;
    };
    const tags = collisionItems.tags || (collisionItems.tags = new Map());
    const tagOf = (id, part) => { const k = `${part}|${id}`; let tg = tags.get(k); if (!tg) { tg = Object.freeze({ id, part }); tags.set(k, tg); } return tg; };
    // R558 (performance): each record keeps the tag it was given (the same shared object as tagOf returns), so a pass
    // does not build a text key per mesh.
    const kept = collisionItems.tagOfRecord || (collisionItems.tagOfRecord = new WeakMap());
    const tagFor = (rec, id, part) => { let tg = kept.get(rec); if (!tg || tg.id !== id || tg.part !== part) { tg = tagOf(id, part); kept.set(rec, tg); } return tg; };
    for (const b of body) {
      const src = b.face ? b.inPlace : b.mesh;
      if (!src) continue;
      const t = collideTable(src.userData.nsFullGeometry || src.geometry, 'body');
      if (!t) continue;
      const tag = tagFor(b, b.id, 'body');
      own.push(reuse(src, t, src.matrixWorld.elements, 0, tag));
      if (b.mirror) twin.push(reuse(b.mirror, t, b.mirror.matrixWorld.elements, 0, tag));
    }
    for (const b of bones) {
      const t = collideTable(b.mesh.userData.nsFullGeometry || b.mesh.geometry, 'body');
      if (!t) continue;
      b.mesh.updateMatrixWorld(true);
      const tag = tagFor(b, b.sourceElementId || null, 'arm');
      own.push(reuse(b.mesh, t, b.mesh.matrixWorld.elements, NsCollide.COLLIDE.armBonePadM, tag));
      if (b.mirror) { b.mirror.updateMatrixWorld(true); twin.push(reuse(b.mirror, t, b.mirror.matrixWorld.elements, NsCollide.COLLIDE.armBonePadM, tag)); }
    }
    for (const g of glass) {
      const t = collideTable(g.geometry, 'brain');
      if (t) brainEntries.push(reuse(g, t, g.matrixWorld.elements, 0, null));
    }
    collideEntries = nextEntries;
    collideCache = Object.freeze({
      own: own.length ? NsCollide.item(own) : null,
      mirror: mirrorRoot.visible && twin.length ? NsCollide.item(twin) : null,
      brain: brainGroup.visible && brainTransformSet && brainEntries.length ? NsCollide.item(brainEntries) : null,
      bodyFrame: Float64Array.from(bodyGroup.matrixWorld.elements), mirrorMatrix: Float64Array.from(mm), brainMatrix: Float64Array.from(bm),
      mirrorCentre: mirror.transform && mirror.transform.centre ? mirror.transform.centre.slice() : null,
      // R558 (Message 12): the brain as a solid (ns-collide insideSolid with brainMatrix's inverse: the glass meshes sit
      // at the brain group's own matrix, identity below it).
      brainSolid: brainGroup.visible && brainTransformSet ? brainSolid : null
    });
    collideKey = key;
    return collideCache;
  }
  /** R558 (Message 12): how far in front of the eye (metres, along the body's forward axis) your body can ever reach (the
   * app measures it over the joint ranges). The mirror plane is set in front of it; when it arrives after the plane was
   * set and the mirror body is still untouched, the plane is set again at once (the start picture, before any input).
   * `sphere` (optional, R558 Message 45): { centre (world m), radiusM }, everything your left hand can reach; it is
   * kept on the placement so a turned or tilted mirror body stands back for its mirror image (ns-mirror
   * MIRROR_ORBIT.reachClear). It never moves the plane. */
  function setMirrorReach(m, sphere = null) {
    mirror.reachForemostM = Number.isFinite(m) && m > 0 ? m : null;
    const sc = sphere && sphere.centre;
    mirror.reachSphere = sc && sc.length === 3 && Array.prototype.every.call(sc, Number.isFinite) && Number.isFinite(sphere.radiusM) && sphere.radiusM > 0
      ? { centre: [sc[0], sc[1], sc[2]], radiusM: sphere.radiusM } : null;
    const Pl = mirror.placement && mirror.placement.plane;
    const nearer = mirror.reachForemostM !== null && Pl && Number.isFinite(Pl.foremostM) && Pl.foremostM < mirror.reachForemostM - 1e-6;
    const noSphere = Boolean(mirror.reachSphere && mirror.placement && !mirror.placement.reach);
    if ((nearer || noSphere) && Pl && mirrorAtRest()) setMirrorPlane();
    return mirror.placement && mirror.placement.plane ? { distanceM: mirror.placement.plane.distanceM, foremostM: mirror.placement.plane.foremostM } : null;
  }
  /** R558 (Message 12): the mirror body's matrices: drawn (what is shown), pipeline (the placement, turn and carry before
   * the stop-at-contact correction), correction (null = none), the drawn centre and the pipeline's carried centre (the
   * point the carry places; the app folds a held-back move into it). */
  function mirrorMatrices() {
    return { drawn: Float64Array.from(mirrorRoot.matrix.elements), pipeline: mirror.pipelineMatrix ? Float64Array.from(mirror.pipelineMatrix) : null,
      correction: mirror.correction ? Float64Array.from(mirror.correction) : null, centre: mirror.transform && mirror.transform.centre ? mirror.transform.centre.slice() : null,
      pipelineCarryCentre: mirror.pipelineCarryCentre ? mirror.pipelineCarryCentre.slice() : null };
  }
  /** R558 (Message 12): a rigid world correction applied on top of the mirror body's placement, so a move that would
   * pass through your body or the brain stops at contact (the app computes it; null removes it). Re-applies at once. */
  function setMirrorCorrection(m) {
    if (m !== null && !(m && m.length === 16 && Array.prototype.every.call(m, Number.isFinite))) fail('scene_input', 'setMirrorCorrection needs a finite 4x4 matrix or null');
    mirror.correction = m === null ? null : Float64Array.from(m);
    applyMirror();
    return mirrorMatrices();
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
    assignMuscleAreas(glowState.links);
    return glowState.links.length;
  }
  /** R558 (Message 2): which area's colour each driven muscle shows. Rule (ns-colors strongestArea): the STRONGER drive
   * wins, score = the link's level x the muscle's weight in it; ties keep the earlier link (map order). A muscle keeps
   * its last area after the links end, so its glow fades out in the same colour. A change of area re-shades the muscle
   * at once on all three bodies (the drives were applied earlier in the frame). A muscle that no hint names any more
   * keeps its colour but stops being drawn as a hint (else a later drive with no area of its own, such as the Space
   * dance, would light it at the faint hint strength without a halo). */
  const ownerBest = new Map();
  const hintOwned = new Set(); // muscle records (body and left arm) drawn as an opposing-action hint
  let assignStamp = 0;
  function assignMuscleAreas(list) {
    assignStamp++;
    ownerBest.clear();
    for (const link of list) {
      for (const id in link.colorBody) {
        const sc = link.level * link.colorBody[id], cur = ownerBest.get(id);
        if (cur === undefined || sc > cur.s) ownerBest.set(id, { s: sc, r: link.regionId, h: link.hint });
      }
    }
    for (const [id, o] of ownerBest) {
      const b = bodyById.get(id);
      if (!b || b.kind !== 'muscle') continue;
      b.assignStamp = assignStamp;
      if (o.h) hintOwned.add(b);
      if (b.owner === o.r && b.ownerHint === o.h) continue;
      b.owner = o.r; b.ownerHint = o.h;
      shadeBodyMuscle(b);
    }
    const armLinks = list.length ? list.filter(l => l.armNames.length || Object.keys(l.armKeys).length) : list;
    if (armLinks.length) {
      for (const m of muscles) {
        if (m.lname === undefined) m.lname = String(m.mesh.name || '').toLowerCase();
        let best = null, bs = 0, bh = false;
        for (const l of armLinks) {
          const w = m.key !== null && l.armKeys[m.key] !== undefined ? l.armKeys[m.key] : l.armNames.some(n => m.lname.includes(n)) ? 1 : 0;
          const sc = l.level * w;
          if (sc > bs) { bs = sc; best = l.regionId; bh = l.hint; }
        }
        if (!best) continue;
        m.assignStamp = assignStamp;
        if (bh) hintOwned.add(m);
        if (m.owner !== best || m.ownerHint !== bh) { m.owner = best; m.ownerHint = bh; shadeArmMuscle(m); }
      }
    }
    if (hintOwned.size) {
      for (const r of hintOwned) {
        if (r.assignStamp === assignStamp && r.ownerHint === true) continue;
        hintOwned.delete(r);
        if (r.ownerHint === true) { r.ownerHint = false; if (r.mat) shadeArmMuscle(r); else shadeBodyMuscle(r); }
      }
    }
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
  /** Fill one ribbon (curve a -> b, camera-facing, constant on-screen width) into buf at its next slot. */
  const lineStyle = { halo: [0, 0, 0], core: [0, 0, 0], intensity: 0, K: GLOW_K };
  function emitRibbon(buf, a, b, level, phase, alphaMul, regionId = null) {
    if (buf.n >= GLOW_LINK.maxLinks) return false;
    // R558: the line takes its AREA's glow colour (core whitened by GLOW_LINK.coreWhite); strength from the level.
    let st = lineStyle;
    const rc = regionId ? areaRecord(regionId) : null;
    if (rc) {
      const k = glowStyle(level).intensity;
      for (let i = 0; i < 3; i++) { lineStyle.halo[i] = rc.glowLinear[i]; lineStyle.core[i] = rc.glowLinear[i] + (1 - rc.glowLinear[i]) * GLOW_LINK.coreWhite; }
      lineStyle.intensity = k;
    } else st = glowStyle(level);
    const K = st.K;
    const curve = glowCurve(a, b, { lift: GLOW_LINK.lift, n: GLOW_LINK.segments });
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const tanPx = (2 * Math.tan((camera.fov * DEG) / 2)) / Math.max(1, cssH);
    const A = GLOW_LINK.across, nA = A.length, o = buf.n * glowVerts, nS = GLOW_LINK.segments;
    const core = GLOW_LINK.corePx / GLOW_LINK.haloPx;
    // R5-access A3: over the brain's drawn outline (the hull refreshed once per frame in updateGlow) only overBrainCore of
    // the core and overBrainHalo of the halo are drawn, so a link never hides the brain areas it crosses.
    const hull = glowHull;
    const oc = Number.isFinite(GLOW_LINK.overBrainCore) ? GLOW_LINK.overBrainCore : Number.isFinite(K.overBrainCore) ? K.overBrainCore : 0.5;
    const oh = Number.isFinite(GLOW_LINK.overBrainHalo) ? GLOW_LINK.overBrainHalo : Number.isFinite(K.overBrainHalo) ? K.overBrainHalo : 0;
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
  // R558: the rims of active areas and driven muscles are set with their colours (applyRegionStyle, shadeMuscle).
  /** Per frame: eased link levels (ns-colors stepGlow), the rims of the linked areas and muscles, and the ribbons. */
  let glowHull = null, glowFlag = '';
  const glowMirrorPoint = new THREE.Vector3();
  function updateGlow(dtMs) {
    const t0 = nowMs();
    glowState.overSamples = 0;
    glowHull = null;
    if (glowState.links.length || glowState.eased.size) {
      if (regionMode && brainTransformSet && brainCoversRect({ x0: 0, y0: 0, x1: 1, y1: 1 }) !== undefined && coverCache.valid) glowHull = coverCache.hull;
    }
    // The levels are used AS GIVEN: R5-input's link levels already follow the 1 s activation envelope (ns-actions
    // glowLinks), so a second, wall-clock smoothing here would make the glow lag behind the area (and differ between
    // live play and QA step frames). A link that leaves the list is gone at once (it is below GLOW_LINK.minLevel then).
    glowState.eased.clear();
    glowOwn.n = 0; glowMirror.n = 0;
    let rimMuscles = 0, rimAreas = 0, topLevel = 0, topRegion = null;
    const regionIds = [], targets = [];
    const phase = reducedMotion ? NaN : ((nowMs() / 1000) / GLOW_LINK.pulseS) % 1; // no travelling pulse under reduced motion
    // R558: one entry per lit area (its strongest link level, all its links' targets), so an area gets at most ONE line.
    const now = nowMs();
    const byArea = new Map();
    for (const link of glowState.links) {
      const lv = link.level;
      if (!(lv >= GLOW_LINK.minLevel) || link.hint || link.line === false) continue; // a hint (or a colour-only link) only colours its muscles (assignMuscleAreas)
      glowState.eased.set(link.key, { level: lv, link });
      const rec = regionById.get(link.regionId);
      if (!rec || !rec.markCentre) continue;
      if (!regionIds.includes(link.regionId)) regionIds.push(link.regionId);
      if (lv > topLevel) { topLevel = lv; topRegion = link.regionId; }
      for (const id of Object.keys(link.body)) targets.push(id);
      for (const n of link.armNames) targets.push(n);
      for (const k of Object.keys(link.armKeys)) targets.push(k);
      let e = byArea.get(link.regionId);
      if (!e) { e = { rec, level: 0, links: [] }; byArea.set(link.regionId, e); }
      if (lv > e.level) e.level = lv;
      e.links.push(link);
      rimAreas++;
    }
    // The age of each lit area's line (from the frame it lit); an area that goes dark forgets it.
    for (const id of [...glowState.lineStart.keys()]) if (!byArea.has(id)) glowState.lineStart.delete(id);
    for (const id of byArea.keys()) if (!glowState.lineStart.has(id)) glowState.lineStart.set(id, now);
    // R558 (Message 48): the same line to the mirror body, when it is shown (group matrices only; the twins share the
    // pose matrix of their own-body mesh).
    const mirrorOn = GLOW_LINK.mirror === true && byArea.size > 0 && mirrorRoot.visible && mirror.transform !== null;
    if (mirrorOn) { mirrorRoot.updateWorldMatrix(true, false); mirrorBodyGroup.updateWorldMatrix(false, false); mirrorArmGroup.updateWorldMatrix(false, false); }
    for (const [regionId, e] of byArea) {
      const lv = e.level, rec = e.rec;
      const env = glowLineEnvelope((now - glowState.lineStart.get(regionId)) / 1000);
      if (!(env > 0)) continue;
      pv.set(rec.markCentre[0], rec.markCentre[1], rec.markCentre[2]).applyMatrix4(brainGroup.matrixWorld);
      const a = [pv.x, pv.y, pv.z];
      // targets -> groups (part + side), weighted centres in the player's world. R558 (FIRST_PERSON_BODY): only muscles of
      // your own body that the ordinary view draws count; the line goes to the ONE group with the most weight.
      const groups = new Map();
      const addT = (key, w, p, own = true, mp = null) => {
        if (!own && !mp) return;
        let g = groups.get(key);
        if (!g) { g = { w: 0, x: 0, y: 0, z: 0, mw: 0, mx: 0, my: 0, mz: 0 }; groups.set(key, g); }
        if (own) { g.w += w; g.x += w * p[0]; g.y += w * p[1]; g.z += w * p[2]; }
        if (mp) { g.mw += w; g.mx += w * mp[0]; g.my += w * mp[1]; g.mz += w * mp[2]; }
      };
      for (const link of e.links) {
        for (const [bid, w] of Object.entries(link.body)) {
          const b = bodyById.get(bid);
          if (!b || b.kind !== 'muscle') continue;
          const gs = b.mesh.geometry.boundingSphere;
          if (!gs) continue;
          rimMuscles++;
          pv.copy(gs.center).applyMatrix4(b.mesh.matrix).applyMatrix4(bodyGroup.matrixWorld);
          const drawn = b.face ? camState.headInPlace : firstPersonShareAt(pv.x, pv.y, pv.z, b.anatomicalPart === 'legs') >= FIRST_PERSON_BODY.pickFrom;
          let mp = null;
          if (mirrorOn && b.mirror) { glowMirrorPoint.copy(gs.center).applyMatrix4(b.mesh.matrix).applyMatrix4(mirrorBodyGroup.matrixWorld); mp = [glowMirrorPoint.x, glowMirrorPoint.y, glowMirrorPoint.z]; }
          addT(`${b.anatomicalPart}:${b.side}`, w, [pv.x, pv.y, pv.z], drawn, mp);
        }
        const armKeys = Object.keys(link.armKeys);
        if (armKeys.length || link.armNames.length) {
          armGroup.updateMatrixWorld(true);
          for (const m of muscles) {
            const nm = m.lname !== undefined ? m.lname : String(m.mesh.name || '').toLowerCase();
            const w = m.key !== null && link.armKeys[m.key] !== undefined ? link.armKeys[m.key] : link.armNames.some(q => nm.includes(q)) ? 1 : 0;
            if (!(w > 0)) continue;
            rimMuscles++;
            const c = armMuscleCentre(m);
            pv.set(c[0], c[1], c[2]).applyMatrix4(armGroup.matrixWorld);
            let mp = null;
            if (mirrorOn) { glowMirrorPoint.set(c[0], c[1], c[2]).applyMatrix4(armGroup.matrix).applyMatrix4(mirrorArmGroup.matrixWorld); mp = [glowMirrorPoint.x, glowMirrorPoint.y, glowMirrorPoint.z]; }
            addT('leftArm:-1', w, [pv.x, pv.y, pv.z], true, mp);
          }
        }
      }
      let best = null, bestM = null;
      for (const g of groups.values()) {
        if (g.w > 0 && (!best || g.w > best.w)) best = g;
        if (g.mw > 0 && (!bestM || g.mw > bestM.mw)) bestM = g;
      }
      // No line to a muscle group right at the camera (your own neck or face seen from the eyes): it would be a long
      // streak across the view toward the eye, not a pointer to the muscles.
      const b = best ? [best.x / best.w, best.y / best.w, best.z / best.w] : null;
      // R558 (Messages 48 and 56): ONE line per lit area. It goes to the mirror body when that body is shown (the
      // whole body is in view there, so the line reads as "this strip part drives that muscle group"); the line to
      // your own body is drawn only when there is no mirror body (GLOW_LINK.own 'no-mirror'): from the eyes it was a
      // long streak toward the bottom of the screen.
      const toMirror = mirrorOn && bestM;
      if (toMirror) emitRibbon(glowMirror, a, [bestM.mx / bestM.mw, bestM.my / bestM.mw, bestM.mz / bestM.mw], lv, phase, env * GLOW_LINK.mirrorAlpha, regionId);
      const ownOn = GLOW_LINK.own === true || (GLOW_LINK.own === 'no-mirror' && !toMirror);
      if (ownOn && b && Math.hypot(b[0] - camera.position.x, b[1] - camera.position.y, b[2] - camera.position.z) >= GLOW_LINK.minTargetM) {
        emitRibbon(glowOwn, a, b, lv, phase, env, regionId);
      }
    }
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
      cpuMs: Math.round(glowState.cpuMs * 1000) / 1000, rimShader: glowRim.applied, rimMaterials: glowRim.materials,
      halos: { built: haloState.built, shown: haloState.shown }, lineMode: GLOW_LINK.mode,
      // R558 (Message 22): the power-up charge (patch state, materials, starts taken, clock).
      powerUp: { shader: powerUp.applied, materials: powerUp.materials, starts: powerUp.starts, settledStarts: powerUp.settledStarts, recharges: powerUp.recharges, clockS: Math.round(powerUpClock.value.x * 1000) / 1000, lastStartS: powerUp.lastStart === null ? null : Math.round(powerUp.lastStart * 1000) / 1000, lastStartArea: powerUp.lastStartArea, reduced: powerUpClock.value.y > 0.5 },
      // R558 (Message 18): the muscle look (patch state, tendon meshes written, tone assignment summary).
      // R558 (Messages 25 to 30): the comic look (patch state, materials, meshes with an ink frame, ink on) and the
      // phalanges drawn from their rounded display copy.
      comic: { shader: comic.applied, materials: comic.materials, hatchMeshes: comic.hatchMeshes, inkOn: comic.inkOn, boneTips: boneTips.meshes, hdr: hdr.state() },
      muscleLook: { shader: muscleLook.applied, materials: muscleLook.materials, tendonMeshes: muscleLook.tendonMeshes || 0, tendonMs: Math.round(muscleLook.tendonMs || 0),
        toneKeys: muscleTones.keys, toneContacts: muscleTones.contacts, toneWorst: muscleTones.worst, toneMs: muscleTones.ms === undefined ? null : muscleTones.ms } };
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
        // R558: every label learns which side of that line its anchor is on (`mirror`), so twins move mirrored.
        it.side = null;
        it.mirror = 0;
        if (Number.isFinite(it.x) && Number.isFinite(it.y)) {
          const m0 = projPx(0, a[1] - 30, a[2]), m1 = projPx(0, a[1] + 30, a[2]);
          if (m0 && m1 && Math.abs(m1[1] - m0[1]) > 1e-3) {
            const dxdy = (m1[0] - m0[0]) / (m1[1] - m0[1]), mx = m0[0] + (it.y - m0[1]) * dxdy;
            if (Math.abs(it.x - mx) > 1) {
              it.mirror = it.x > mx ? 1 : -1;
              // Check fix (hunt 2): twins too keep to their anchor's half. They move by the same offset mirrored, so a
              // pair whose anchors sit near the midline (the legs, in a portrait window) could both step across it and
              // swap sides ("Left leg" over the brain's left half, which moves the right leg). A twin pair with no
              // place on its own halves is not shown, never shown on the wrong ones.
              if (it.required || (typeof it.pair === 'string' && it.pair !== '')) it.side = { x0: m0[0], y0: m0[1], dxdy, sign: it.mirror };
            }
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
      const maxShown = compact ? LABEL_LAYOUT.maxShownCompact : LABEL_LAYOUT.maxShown;
      let pos = declutterLabels(items, { width: cssW, height: cssH, topPx, obstacles: obst, maxShown });
      // R558 (hunt 2 limit): keep the labels off the mirror body's V tips as well (at 16:9 its left tip sat under the
      // "Right leg" label), but only when every label that has a place without them still has one: the leg pair, which
      // sits between the mirror body's feet, matters more than a partly covered tip.
      const MSL = arrowSets.mirror;
      if (MSL && MSL.shown && MSL.boxes) {
        const n0 = obst.length;
        for (const d of ARROW_DIRS) { const b = MSL.boxes[d]; if (b) obst.push({ x0: b.x0 - 4, y0: b.y0 - 4, x1: b.x1 + 4, y1: b.y1 + 4 }); }
        if (obst.length > n0) {
          const alt = declutterLabels(items, { width: cssW, height: cssH, topPx, obstacles: obst, maxShown });
          // (and no label that sat cleanly without them is forced and faded with them: hunt 3)
          if (alt.every((q, i) => (q.shown || !pos[i].shown) && !(q.faded && !pos[i].faded))) pos = alt;
        }
      }
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
    outline.setSize(width, height, pr); // R558 (Message 20): the ID target follows the drawing buffer (no-op when unchanged)
    { const b = typeof renderer.getDrawingBufferSize === 'function' ? renderer.getDrawingBufferSize(hdrSize) : null; hdr.setSize(b ? b.x : width * pr, b ? b.y : height * pr); } // R558 (Message 25)
    const w = armWinUniform.value;
    w[0] = (width * pr) / 2; w[1] = (height * pr) / 2; w[2] = ARM_SEE.radiusFrac * Math.min(width, height) * pr; w[3] = ARM_SEE.edge;
    cssPr = pr;
    borderShared.nsLineW.value.w = pr; // R558: area border widths are CSS pixels
    glassInkUniforms.nsGInk.value.w = pr; // R558 BB: the glass ink widths too
    for (const k of ['brain', 'mirror']) { const r = arrowSets[k] && arrowSets[k].rig; if (r && typeof r.setPixelRatio === 'function') r.setPixelRatio(pr); } // and the arrows' ink
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
      if (glassAll.xray) glassAll.xray.visible = !L.lite;
    }
    const lodKey = L.lod ? `${L.lod.glassMm}/${L.lod.bodyMm}/${L.lod.armMm || 0}` : '';
    // R558 (Messages 24, 29): the bodies' ink (striation, hatching, stipple) is drawn at every level without a lod
    // (BODY_CEL; the bands, rim and highlight shapes stay at every level).
    comic.inkOn = !L.lod;
    comicUniforms.nsInkLine.value.w = comic.inkOn ? 1 : 0;
    // R558 (Message 25): the HDR bloom at the full level (HDR_BLOOM.levels), one blur level fewer at the 0.75 / 0.5 render
    // scales, off from the lite / lod levels; the muscle peaks are boosted only while it is on.
    const hdrLevels = qState.level >= HDR_BLOOM.offFromLevel ? 0 : qState.level === 0 ? HDR_BLOOM.levels : HDR_BLOOM.levels - 1;
    hdr.setLevel(hdrLevels);
    comicUniforms.nsHdrBoost.value.x = hdrLevels > 0 && hdr.state().supported ? HDR_BLOOM.muscleBoost : 0;
    if (lodApplied !== lodKey) setLod(L.lod, lodKey);
    else if ((mirror.lod || 0) !== mirrorLodCell()) applyMirrorLod();
  }
  /** The 'lod' copies: built once on first use (clusterDecimate; about 10 ms for the glass in Node) and swapped in or out
   * on every mesh that shares a geometry (the glass shell, its depth pre-pass and x-ray copies; a body mesh and its depth
   * twins). The full geometries are kept, so leaving the level restores them exactly. */
  let lodApplied = '';
  const lodOf = new Map(); // full geometry -> Map(cell -> lod geometry)
  const lodStats = {};
  // R558 (dark flecks at Low): the body's copies (clusterLodPlan) hold their own buffers, re-written from the full ones
  // (lodSync) whenever those change: full geometry -> Set of its copies.
  const lodSyncs = new Map();
  function lodSync(lod, moved = false) {
    const u = lod.userData, plan = u.nsLodPlan, full = u.nsLodFull;
    for (const name of moved ? ['position', 'normal'] : Object.keys(lod.attributes)) {
      const a = lod.attributes[name], f = full.attributes[name];
      if (!a) continue;
      if (!f) continue;
      clusterLodMeans(plan, f.array, f.itemSize, a.array, name === 'normal');
      a.needsUpdate = true;
    }
  }
  // vertices moved. R558 (hunt 3): a Low-quality body copy has its OWN position array (bodyLodGeometry), so its pick tree
  // must be stamped too, or the crosshair keeps picking the copy's old pose (pickTreeOf keys on the array's stamp).
  function lodTouch(geo) {
    const set = lodSyncs.get(geo);
    if (set) for (const g of set) { lodSync(g, true); if (g.attributes.position) pickBufferWritten(g.attributes.position.array); }
  }
  function bodyLodGeometry(geo, cell, stat) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index;
    // the plan is made once on the unlifted, unskinned rest geometry (the lift and the skin move vertices smoothly)
    const L = bodyLiftGeos.get(geo), R = bodySkinGeos.get(geo);
    const restP = L ? L.rest : R ? R.rest : pos.array;
    const restN = L ? L.restN : R && R.restN ? R.restN : nor ? nor.array : computeNormals(pos.array, idx.array);
    const plan = clusterLodPlan(restP, restN, idx.array, cell * LOD_BUCKET_CELL_SCALE);
    const lod = keep(new THREE.BufferGeometry());
    for (const name of Object.keys(geo.attributes)) {
      const a = geo.attributes[name];
      if (!(a.array instanceof Float32Array) || !(a.itemSize >= 1 && a.itemSize <= 4) || a.array.length !== a.itemSize * restP.length / 3) continue;
      lod.setAttribute(name, new THREE.BufferAttribute(new Float32Array(a.itemSize * plan.clusters), a.itemSize));
    }
    lod.setIndex(new THREE.BufferAttribute(plan.indices, 1));
    lod.userData.nsLodPlan = plan; lod.userData.nsLodFull = geo;
    lodSync(lod);
    if (!geo.boundingSphere && typeof geo.computeBoundingSphere === 'function') geo.computeBoundingSphere();
    if (geo.boundingSphere) lod.boundingSphere = geo.boundingSphere; // the full sphere already holds every lift / skin pose
    if (geo.boundingBox) lod.boundingBox = geo.boundingBox;
    lod.userData.nsLodStat = { stat, full: idx.count / 3, lod: plan.triangles };
    if (stat) { stat[0] += idx.count / 3; stat[1] += plan.triangles; }
    let set = lodSyncs.get(geo);
    if (!set) lodSyncs.set(geo, (set = new Set()));
    set.add(lod);
    return lod;
  }
  function lodGeometry(geo, cell, stat, kind = null) {
    let byCell = lodOf.get(geo);
    if (!byCell) { byCell = new Map(); lodOf.set(geo, byCell); }
    let lod = byCell.get(cell);
    if (lod) return lod;
    const pos = geo.attributes && geo.attributes.position, idx = geo.index;
    if (!pos || !idx) { byCell.set(cell, geo); return geo; }
    if (kind === 'body') { lod = bodyLodGeometry(geo, cell, stat); byCell.set(cell, lod); return lod; }
    // R558: a lifted body muscle has ONE vertex buffer that is rewritten when the lift amount changes, so its coarser
    // copy is index-only over that buffer (clustered once on the unlifted positions) and follows the lift for free.
    const lifted = bodyLiftGeos.get(geo) || bodySkinGeos.get(geo); // R558: skinned hand muscles likewise
    if (lifted) {
      const r = clusterIndexLod(lifted.rest, idx.array, cell);
      lod = keep(new THREE.BufferGeometry());
      for (const name of Object.keys(geo.attributes)) lod.setAttribute(name, geo.attributes[name]);
      lod.setIndex(new THREE.BufferAttribute(r.indices, 1));
      if (geo.boundingSphere) lod.boundingSphere = geo.boundingSphere;
      lod.userData.nsLodStat = { stat, full: idx.count / 3, lod: r.triangles };
      if (stat) { stat[0] += idx.count / 3; stat[1] += r.triangles; }
      byCell.set(cell, lod);
      return lod;
    }
    const sulc = geo.attributes.nsSulc ? geo.attributes.nsSulc.array : null;
    const near = geo.attributes.nsNear ? geo.attributes.nsNear.array : null; // R558: glass clearing (GLASS_CLEAR)
    const tend = geo.attributes.nsTendon ? geo.attributes.nsTendon.array : null; // R558 (Message 18): muscle tendon ends
    const carry = sulc || near || tend ? { ...(sulc ? { nsSulc: sulc } : {}), ...(near ? { nsNear: near } : {}), ...(tend ? { nsTendon: tend } : {}) } : null;
    const d = clusterDecimate(pos.array, idx.array, cell, carry);
    lod = keep(indexedGeometry(d.positions, d.indices));
    lod.computeVertexNormals();
    if (d.attrs && d.attrs.nsSulc) lod.setAttribute('nsSulc', new THREE.BufferAttribute(d.attrs.nsSulc, 1));
    if (d.attrs && d.attrs.nsNear) lod.setAttribute('nsNear', new THREE.BufferAttribute(d.attrs.nsNear, 1));
    if (d.attrs && d.attrs.nsTendon) lod.setAttribute('nsTendon', new THREE.BufferAttribute(d.attrs.nsTendon, 1));
    if (typeof lod.computeBoundingSphere === 'function') lod.computeBoundingSphere();
    lod.userData.nsLodStat = { stat, full: idx.count / 3, lod: d.triangles };
    stat[0] += idx.count / 3; stat[1] += d.triangles;
    byCell.set(cell, lod);
    return lod;
  }
  function setLod(lod, key) {
    const t0 = nowMs();
    const st = lod ? (lodStats[key] ||= { builtMs: null, glass: [0, 0], body: [0, 0] }) : null;
    const fresh = st && st.builtMs === null;
    const swap = (mesh, cell, stat, kind = null) => {
      if (!mesh) return;
      const full = mesh.userData.nsFullGeometry || mesh.geometry;
      if (!mesh.userData.nsFullGeometry) mesh.userData.nsFullGeometry = full;
      const g = lod ? lodGeometry(full, cell, stat, kind) : full;
      mesh.geometry = g;
      for (const c of mesh.children || []) if (c.userData && c.userData.depthTwin) c.geometry = g;
      if (mesh.userData.nsInPlaceTwin) mesh.userData.nsInPlaceTwin.geometry = g;
    };
    for (const list of [glass, glassDepth, glassXray]) for (const m of list) swap(m, lod ? lod.glassMm : 0, st ? st.glass : null);
    glassAllLod(lod ? lod.glassMm : 0);
    for (const b of body) swap(b.mesh, lod ? lod.bodyMm : 0, st ? st.body : null, 'body');
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
      // R558 (dark flecks at Low): at the LOD levels the mirror's cell is the body's own, so it draws the body's copy.
      const own = cell > 0 && lodOf.get(full) ? lodOf.get(full).get(cell) : null;
      const g = cell > 0 ? (own || mirrorIndexLod(full, cell, false)) : b.mesh.geometry;
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
      if (lodOf.get(full) && lodOf.get(full).get(mirrorLodWant)) continue; // R558: it draws the body's own copy
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
      // R558: a down-step that was not taken (the game's own work filled the frame, or the level is held after a step
      // that did not help), the levels so held (controller clock, ms) and whether a step is being measured right now.
      lastHold: qState.lastHold || null, noGainUntil: { ...(qState.noGain || {}) }, clockMs: Math.round(qState.clockMs), probing: Boolean(qState.probe),
      busyMs: Number.isFinite(lastBusyMs) ? Math.round(lastBusyMs * 100) / 100 : null,
      buffer: cssW > 0 ? [Math.round(cssW * cssPr), Math.round(cssH * cssPr)] : null,
      lod: lodApplied ? { cellsMm: lodApplied, builtMs: lodStats[lodApplied].builtMs, glassTriangles: lodStats[lodApplied].glass.slice(), bodyTriangles: lodStats[lodApplied].body.slice(), armTriangles: lodStats[lodApplied].arm ? lodStats[lodApplied].arm.slice() : null } : null,
      // Last frame's draw calls and triangles (Three renderer.info; main pass only) and the main-thread ms of render().
      drawCalls: mainPassInfo.calls,
      triangles: mainPassInfo.triangles,
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
    powerUpClock.value.x = (now - powerUpEpoch) / 1000; // R558 (Message 22): the power-up clock (one uniform write)
    const notLive = Boolean(opts && opts.live === false);
    const dtMs = lastRenderAt === null ? 0 : now - lastRenderAt; // eases (held cue, ghosts): every drawn frame
    lastRenderAt = now;
    const sampleMs = lastSampleAt === null ? 0 : now - lastSampleAt; // quality samples: live frame to live frame only
    lastSampleAt = notLive ? null : now;
    if (!notLive && sampleMs > 0 && (qState.mode === 'auto')) {
      const before = qState.level;
      qState = stepQuality(qState, sampleMs, qualityOpts, QUALITY_LEVELS, lastBusyMs);
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
      shellRimUniforms.nsRimOpacity.value = rim.rimOpacity; shellRimUniforms.nsRimPower.value = rim.rimPower; shellRimUniforms.nsRimGroove.value = rim.rimGroove;
    }
    if (strip) strip.uniforms.nsTime.value = (now / 1000) % 1000;
    // Arm ghost window (auto): while the crosshair is on a control region (legacy marker or region mode).
    const target = OWN_BODY_SOLID ? 0 : armGhostState.mode === 'auto' ? (typeof highlighted === 'string' || gazeOnRegion ? 1 : 0) : armGhostState.mode;
    const k = dtMs > 0 ? 1 - Math.exp(-dtMs / 1000 / ARM_GHOST.easeS) : 1;
    let a = armGhostState.amount + (target - armGhostState.amount) * k;
    if (Math.abs(target - a) < 1e-3) a = target;
    armGhostState.amount = a;
    armSeeUniform.value[0] = a;
    // R3-scene: the arm's depth pre-pass twins only while its smooth window is open (otherwise the arm is drawn at alpha 1).
    const twinsOn = a > 1e-3;
    if (twinsOn !== armTwinsOn) { armTwinsOn = twinsOn; for (const t of armTwins) t.visible = twinsOn; }
    const tTarget = !OWN_BODY_SOLID && body.length && BODY_TRANSLUCENT.enabled !== false ? bodySeeThroughAmount(lookPitch, BODY_TRANSLUCENT) : 0;
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
    stepPickTrees(); // R558: pick trees a few per frame, ahead of the first pick that needs them
    {
      const showMirror = mirror.enabled && mirror.ready && mirror.transform !== null;
      if (mirrorRoot.visible !== showMirror) { mirrorRoot.visible = showMirror; overlayDirty = true; }
    }
    stepArrowVisibility(); // R558 (hunt 2, FRAME_VIS): tips behind your body / sets mostly hidden, before the arrows update
    updateArrows();
    updateFaceLayer();
    layoutOverlay();
    // R558 (FIRST_PERSON_BODY): the eye point in view space and how much of the rule applies this frame.
    updateFirstPersonBody();
    // R3-fix (M4): the body is see-through where it covers the brain's on-screen outline (the ellipse in the brain's
    // projected bounds, from the overlay layout of this frame), only while the brain is in front of the camera.
    // R5-scene (D18): NOT in third person (you are there to look at your body): the body stays solid, and only a small
    // soft window at the crosshair opens while the crosshair is on a motor area, so the area you look at is never hidden.
    {
      const third = camState.headInPlace;
      const on = !OWN_BODY_SOLID && !third && body.length > 0 && regionMode && brainTransformSet && brainOverlayOk && cssW > 0 && cssH > 0 && (camPose ? camMul.overBrain : 1) > 0;
      const win = !OWN_BODY_SOLID && third && body.length > 0 && cssW > 0 && cssH > 0 && (gazeOnRegion || typeof highlighted === 'string');
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
      // R558: only what lies beyond the brain's nearest point (from the render camera) can be behind the glass.
      behindGlass.nearM = Number.isFinite(cameraRange.brainNearM) && cameraRange.brainNearM > 0 ? cameraRange.brainNearM : 0;
      bgUniform.value.z = behindGlass.nearM;
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
      const cx = v[0] * pw[0] + v[4] * pw[1] + v[8] * pw[2] + v[12], cy = v[1] * pw[0] + v[5] * pw[1] + v[9] * pw[2] + v[13],
        cz = v[2] * pw[0] + v[6] * pw[1] + v[10] * pw[2] + v[14];
      const ax = farEyeView.axis;
      if (ax) {
        // R558 (ns-brain pictureAxis 'view'): the squash is along a fixed axis u, not the line of sight to the centre.
        // The real point behind a drawn point p is p + (K - 1) (p . u) u. The shaders compute K c + d + (K - 1) (d . n) n
        // with d = p - c and n = c / |c|, which is that same point when c is the centre's foot on the axis through the
        // eye: c = (C . u) u. So only this uniform changes; with u along the line of sight c is the centre, as before.
        const ux = v[0] * ax[0] + v[4] * ax[1] + v[8] * ax[2], uy = v[1] * ax[0] + v[5] * ax[1] + v[9] * ax[2], uz = v[2] * ax[0] + v[6] * ax[1] + v[10] * ax[2];
        const along = cx * ux + cy * uy + cz * uz;
        if (along > 0) farEyeVec.value.set(along * ux, along * uy, along * uz, farEyeView.K);
        else farEyeVec.value.w = 0; // the brain is not ahead along the axis: Three's own normals for this frame
      } else farEyeVec.value.set(cx, cy, cz, farEyeView.K);
    } else farEyeVec.value.w = 0;
    // Camera-range enforcement belongs to active held manipulation, not a released world-fixed object.
    if (mirror.carryHeldAtReconcile === true && mirror.worldCentre && mirrorRoot.visible) {
      const envelope = currentMirrorEnvelope();
      if (!(envelope.minCameraDepthM >= camera.near && envelope.maxCameraDepthM <= camera.far)) fail('scene_input', 'current full mirror geometry violates camera range; ordinary pose remains unresolved');
    }
    checkCameraProjectionPlan();
    // R558 (Message 20): the outline ID pass of this frame's body meshes (the composite in `scene` reads it). The soft
    // depth shading (ns-outline OUTLINE_AO) is drawn only at the full quality level; the lines at every level.
    // R558 BB (Message 28): the lines' supersampling follows the quality level too (ns-outline OUTLINE_AA).
    outline.setOcclusion(qState.level === 0);
    outline.setQuality(qState.level);
    // R558 (performance, P3): the scene's world matrices are brought up to date ONCE for the frame, here, instead of by
    // the outline pass and again by the main render (each of which updated the whole graph when it found the scene's
    // auto update on). Nothing moves between the two passes, so both see exactly the matrices they computed before.
    const autoWorld = scene.matrixWorldAutoUpdate === true;
    if (autoWorld) { scene.updateMatrixWorld(); scene.matrixWorldAutoUpdate = false; }
    let hdrOn = false;
    try {
      outline.render(scene, camera);
      // R558 (Message 25): into the HDR target when it is on (createHdrBloom), then bloom and composite to the canvas.
      hdrOn = hdr.begin();
      renderer.render(scene, camera);
    } finally { if (autoWorld) scene.matrixWorldAutoUpdate = true; }
    if (renderer.info && renderer.info.render) { mainPassInfo.calls = renderer.info.render.calls; mainPassInfo.triangles = renderer.info.render.triangles; }
    renderFaceLayer();
    if (hdrOn) hdr.end();
    const end = nowMs();
    lastRenderCpuMs = end - now;
    // R558 (quality controller, rule a): this live frame's main-thread work, from the frame's start (ns-app) to here.
    lastBusyMs = !notLive && opts && Number.isFinite(opts.frameStartMs) ? end - opts.frameStartMs : NaN;
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
      /** R558 BB2: the brain's comic ink as plain data: areaInk (the motor areas' patch, the strip relief and its load ms)
       * and glassFold (the glass's background fold-depth job: state, vertices, slices, work and wall ms). */
      get brainInk() { const { token, ...gf } = glassFold; return { areaInk: { ...areaInk }, glassFold: gf }; },
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
    setSettledRegions, // R558 (Message 22)
    setRegionHints, // R558 (Message 6)
    regionHintState,
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
    bodyScreenBoxes, // R558 (hunt 2)
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
    setCameraPose, releaseCameraProjectionPlan, abandonCameraProjectionPlan, muscleAt,
    cameraState,
    setMirrorView,
    /** R5-mirror's name for it (round5/R5-mirror-NOTES.md 4.1: scene.setMirror(NM.mirrorTransform(state))). */
    setMirror: setMirrorView,
    mirrorState,
    mirrorPartAt, graspTargetAt, controlLayersAt, reconcileMirrorCarry, setHeldItem,
    collisionItems, mirrorMatrices, setMirrorCorrection, setMirrorReach, // R558 (Message 12): keep the three items apart
    mirrorPlacementNow,
    bodyKeepOut,
    // R5-integrate-core (D15): the Body Worlds layer labels of the body's muscle meshes, and the lifted left arm.
    // R558: setBodyLift draws the stack on the body (own and mirror).
    setBodyLayers,
    setBodyLift,
    setBodySkin, updateBodySkin,
    setArmLayers,
    setOutlineSegments, // R558 (Message 20)
    outlineState: () => ({ ...outline.state(), quality: QUALITY_LEVELS[qState.level].name, renderMs: Number.isFinite(lastRenderCpuMs) ? Math.round(lastRenderCpuMs * 100) / 100 : null }),
    get regionMode() { return regionMode; },
    /** Plain-JSON state of the U2b-scene features (QA / tests). */
    sceneState() {
      return {
        regionMode, brainTransformSet, regions: regions.length, hoveredRegionId, gazeOnRegion,
        activatedRegionIds: regions.filter(r => r.activated >= 1).map(r => r.id),
        regionHints: regionHintState(), // R558 (Message 6)
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
        outline: outline.state(), // R558 (Message 20): the outline pass (batch size, last ID pass draw calls and CPU ms)
        held: { target: heldCue.target, amount: Math.round(heldCue.amount * 1000) / 1000 },
        hudRects: { mode: hudMo ? 'observers' : 'poll', reads: hudReads, msTotal: Math.round(hudReadMs * 100) / 100 },
        leftArmRim: { ...leftArmRim }, regionBorder: { ...regionBorder }, areaInk: { ...areaInk }, glassFold: (({ token, ...gf }) => gf)(glassFold),
        cameraRange: { near: camera.near, far: camera.far, brainNearM: cameraRange.brainNearM, brainFarM: cameraRange.brainFarM, mirrorFarM: cameraRange.mirrorFarM, brainDistanceScale: brainDistK },
        armShapes: labelAvoid ? { rects: labelAvoid.rects.map(r => [r.x0, r.y0, r.x1, r.y1].map(v => Math.round(v * 1e4) / 1e4)), ellipses: labelAvoid.ellipses.map(e => [e.cx, e.cy, e.rx, e.ry].map(v => Math.round(v * 1e4) / 1e4)) } : null,
        arrowHover: hoverDir, mirrorArrowHover: arrowHover && arrowHover.target === 'mirror' && !arrowHover.blocked ? arrowHover.dir : null, brainBoundsPx: arrowsShown ? { ...brainBoundsPx } : null,
        markDots: [...markDots].map(([id, d]) => ({ id, shown: d.shown, small: d.small, areaPx: d.area, left: d.x, top: d.y })),
        labels: labelEls.map((L, i) => ({ text: L.group.text, display: L.display ? `${L.display.main}${L.display.sub ? ` / ${L.display.sub}` : ''}` : null, shown: L.last.shown, left: L.last.left, top: L.last.top, w: labelBoxes[i] ? labelBoxes[i].w : null, h: labelBoxes[i] ? labelBoxes[i].h : null, faded: L.last.faded === true, side: labelItems[i] && labelItems[i].side ? { ...labelItems[i].side } : null })),
        info: info ? { shown: !info.panel.hidden } : null,
        body: { meshes: body.length, face: body.filter(b => b.face).length, facePacket: facePacketMeshes, layers: bodyLayerInfo ? { ...bodyLayerInfo } : null, lift: bodyLiftInfo ? { ...bodyLiftInfo } : null, frame: bodyFrameSource, eyeBp: eyeBp.slice(), bodyYaw },
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
/** R558 (Message 2): one chip per area colour family ([family key, words]); the chip shows the family's shades
 * (ns-colors areaFamilySwatchCss), so the key matches the areas and the muscles. */
export const HUD_LEGEND_FAMILIES = Object.freeze((NS_TEXT.LEGEND.families || []).map(r => Object.freeze([r[0], r[1]])));
export const HUD_LEGEND_SHARED = NS_TEXT.LEGEND.shared;
/** Always-visible simulated/representative limits notice. It wraps at a fixed readable font size.
 * The nominal top margin comes from the unchanged arm-fit setting; actual glyph/hand clearance is unverified. */
export const HUD_LIMITS_SHORT = NS_TEXT.HUD.limitsShort;
/** Nominal arm-fit margin, retained unchanged. HUD placement also considers the measured notice height;
 * neither this constant nor the approximate arm-avoid shapes prove actual whole-hand pixel bounds. */
export const ESSENTIAL_BAND = ARM_DEFAULTS.marginNdc / 2;
export const ORIENTATION_KEYS = Object.freeze(['right', 'left', 'anterior', 'posterior']);
/** R558: a side label's anchor may be any brain outline point within this share of the furthest one along its side
 * (on screen); the one level with the brain's centre is taken, so "Your left" and "Your right" sit as a level pair
 * (brainOrientationAnchors). Display choice. */
export const SIDE_LABEL_TIE = 0.06;
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
  // R558: the bar shows the GLOW STRENGTH (dark resting surface -> bright glow; ns-colors glowStrengthLegendStops): each
  // area keeps its own colour, which the family chips below explain. render({ legendStops }) still replaces it.
  if (bar.style) bar.style.background = `linear-gradient(to right, ${glowStrengthLegendStops(9).join(', ')})`;
  const ends = make('div', 'ns-legend-ends', legend);
  slots.legendLo = make('span', 'ns-legend-lo', ends);
  make('span', 'ns-legend-mid', ends).textContent = HUD_LEGEND_SHARED;
  slots.legendHi = make('span', 'ns-legend-hi', ends);
  if (HUD_LEGEND_FAMILIES.length) {
    const fam = make('ul', 'ns-legend-families', legend);
    fam.setAttribute('aria-label', NS_TEXT.LEGEND.familiesLabel || '');
    fam.title = NS_TEXT.LEGEND.familiesLabel || '';
    for (const [key, words] of HUD_LEGEND_FAMILIES) {
      const li = make('li', `ns-legend-family ns-legend-family-${key}`, fam);
      const chip = make('span', 'ns-legend-chip', li);
      const bg = areaFamilySwatchCss(key);
      if (chip.style && bg) chip.style.background = bg;
      make('span', 'ns-legend-family-text', li).textContent = words;
    }
  }
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
  let crossActive = false, crossHold = '';
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
      } else if (key === 'crosshairActive' || key === 'crosshairHold') {
        // R558 (Message 48): crosshairHold '' | 'empty' | 'item': a ring closes round the crosshair while Space grips
        // (white on nothing, the accent colour while something is held).
        if (key === 'crosshairActive') crossActive = Boolean(v); else crossHold = v === 'item' || v === 'empty' ? v : '';
        setClass(cross, `ns-crosshair${crossActive ? ' ns-crosshair-active' : ''}${crossHold ? ` ns-crosshair-grip${crossHold === 'item' ? ' ns-crosshair-holding' : ''}` : ''}`);
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
    } else if (reserved && reserved.layout === 'corner' && legend.style && panelSizes && panelSizes[0] && panelSizes[1]) {
      // R558: the colour key folds away with "More detail" in landscape (CSS); when shown it sits on the left edge,
      // directly above the status card. It is an on-demand overlay there, so it reserves nothing.
      legendSlot = { x: g, y: Math.max(top, H - g - panelSizes[0][1] - g - panelSizes[1][1]) };
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
        // R558 (motor strip fills the view): in landscape the card's ONE home is the bottom-left corner, hung from the
        // floor (it grows upward), because the motor areas now reach the top-left corner of the view; its planned box
        // is the same corner at the planned height. Portrait keeps the top strip.
        const corner = { x: left, y: Math.max(top, floor - h), box: { x0: left / W, y0: Math.max(top, floor - hp) / H, x1: (left + w) / W, y1: floor / H } };
        const home = portrait ? atP(left, top) : corner, alt = home;
        const handClear = c => fit && !hitsAvoid(padded(c.box), handAvoid) && clearPanels(c);
        const use = home;
        if (!handClear(use)) limited = true;
        const box = q => [q.box.x0 * W, q.box.y0 * H, q.box.x1 * W, q.box.y1 * H].map(v => Math.round(v)).join(',');
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
      // R558 check (Message 31): then centred below and centred above the crosshair. The mirror body's side tips sit as a
      // level pair either side of its head at the start view (both moved up off your left hand, FRAME_PAIR tieShift), so
      // every corner beside the crosshair touched one of them (measured at 1600x900: the caption 818-921 x 462-480 over
      // the right tip 896-924 x 440-500) and the caption was drawn over the tip.
      const arrowsF = opts && Array.isArray(opts.arrows) ? opts.arrows : [];
      const corners = [[18, 12], [-18 - hs[0], 12], [18, -12 - hs[1]], [-18 - hs[0], -12 - hs[1]], [-hs[0] / 2, 18], [-hs[0] / 2, -18 - hs[1]]];
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
    // R558 (issue hunt 1, item 10): the candidate index (0 = the anchor, then the slides along the side, then the
    // inward steps; orientationCandidates) and the height where the first side label went, so the second tries the
    // same kind of place first, at exactly that height when it is clear there, and the pair stays level.
    let sidePairIndex = null, sidePairY = null, firstSide = null;
    const sideHide = {}; // R558 (Message 31): this call's hidden flags of the two side labels (written as a pair below)
    const candIndex = key => { const d = key.indexOf('.'); return d < 0 ? 0 : Number(key.slice(d + 1)); };
    // write one label's place (A2-render R1: attribute and style writes only when the value changes, no per-frame DOM
    // invalidation) and record its box for this call (a label placed again replaces its earlier box)
    const commitOrient = (k, el, use, chosen) => {
      setClass(el, `ns-orient ns-orient-${k}`);
      const last = orientLast[k], placement = chosen ? 'clear-estimate' : 'limited';
      const left = `${(use.x * 100).toFixed(2)}%`, top = `${(use.y * 100).toFixed(2)}%`;
      if (last.placement !== placement) { el.setAttribute('data-ns-placement', placement); last.placement = placement; }
      if (last.left !== left) { el.style.left = left; last.left = left; }
      if (last.top !== top) { el.style.top = top; last.top = top; }
      const i = placedOrient.findIndex(q => q.key === k);
      if (i >= 0) placedOrient.splice(i, 1);
      if (use.box) placedOrient.push({ key: k, x0: use.box.x0 * W, y0: use.box.y0 * H, x1: use.box.x1 * W, y1: use.box.y1 * H });
    };
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
      const sideKey = k === 'right' || k === 'left';
      // (side labels: written below, as a pair.) R558 (performance): a front/back label with no clear place used to be
      // shown here and hidden again a few lines down on EVERY call (two attribute writes a frame, and the page's style
      // work with them; seen: "Back" under the status card, 182 writes in 273 frames). It is now shown only once its
      // place is known (below); its size while hidden is the last measured one or the estimate from its text.
      if (sideKey) sideHide[k] = !show; else if (el.hidden !== !show && (!show || !el.style)) el.hidden = !show;
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
      if (side && sidePairIndex !== null) {
        const i = placed.findIndex(c => candIndex(c.key) === sidePairIndex);
        if (i > 0) placed.unshift(placed.splice(i, 1)[0]);
        const m = placed.find(c => candIndex(c.key) === sidePairIndex), mc = m && cands.find(c => c.key === m.key);
        if (m && mc && sidePairY !== null && m.y !== sidePairY) placed.unshift({ key: m.key, ...placeOf({ x: mc.p.x, y: sidePairY }) });
      }
      const current = placed.find(c => c.key === orientPick[k]);
      const best = placed.find(free) || null;
      // R558 (user Message 31, symmetry): the second side label takes the first one's height whenever any of its own
      // places is clear there (its own x, the shared y): a level place wins over its sticky current place, so the two
      // never stay at different heights (seen: 1280x720 third person "← Your left" at y 68, "Your right →" at y 426).
      const level = side && sidePairY !== null ? cands.map(c => ({ key: c.key, ...placeOf({ x: c.p.x, y: sidePairY }) })).find(free) || null : null;
      // R4-polish: a label stays where it is while that place is clear (no flicker), but moves to a better (earlier,
      // e.g. outside the brain) place once that one has been clear for ORIENT_UPGRADE_FRAMES calls in a row; before,
      // a label that started on an inner fallback stayed there for good.
      if (best && current && best.key !== current.key && placed.indexOf(best) < placed.indexOf(current)) orientUpgrade[k] = (orientUpgrade[k] || 0) + 1;
      else orientUpgrade[k] = 0;
      let chosen = level || (current && free(current) && orientUpgrade[k] < ORIENT_UPGRADE_FRAMES ? current : best) || null;
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
      if (!chosen && W > 0 && H > 0) { if (sideKey) sideHide[k] = true; else if (!el.hidden) el.hidden = true; continue; }
      if (!sideKey && el.hidden) el.hidden = false;
      const use = chosen || placed[0];
      // R558 (Message 31): no level place for this second side label: the first one moves to this one's height instead
      // when one of ITS places is clear there; with neither, the two stay where they are (rare; both still shown).
      if (side && chosen && firstSide && Math.abs(use.y - sidePairY) * H > 0.5) {
        const re = firstSide.cands.map(c => ({ key: c.key, ...firstSide.placeOf({ x: c.p.x, y: use.y }) })).find(firstSide.free);
        if (re) { firstSide.commit(re, true); sidePairY = re.y; }
      }
      orientPick[k] = use.key;
      if (side && chosen && sidePairIndex === null) {
        sidePairIndex = candIndex(use.key); sidePairY = use.y;
        firstSide = { cands, placeOf, free, commit: (u, ch) => { orientPick[k] = u.key; commitOrient(k, el, u, ch); } };
      }
      commitOrient(k, el, use, chosen);
    }
    // R558 (Message 31): the two side labels are a pair, like the region label twins: both show or neither does (seen:
    // portrait third person, "Right →" alone at the right edge while "← Left" had no clear place). Their hidden flags
    // are written here once per call, only when they change.
    if (W > 0 && H > 0 && (sideHide.left === true || sideHide.right === true)) {
      for (const k of ['left', 'right']) {
        if (sideHide[k] === false) { sideHide[k] = true; const i = placedOrient.findIndex(q => q.key === k); if (i >= 0) placedOrient.splice(i, 1); }
      }
    }
    for (const k of ['left', 'right']) if (typeof sideHide[k] === 'boolean' && orient[k] && orient[k].hidden !== sideHide[k]) orient[k].hidden = sideHide[k];
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
