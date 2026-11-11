/** NeuroSurge colours.
 *
 * R558 (user Message 2): the motor areas and the muscles are now coloured by AREA (AREA_COLORS at the end of this file:
 * one colour per motor area, one hue family per body part, the same colour on the brain area, the muscles it drives on
 * your body and the same muscles on the mirror body); the brightness of the glow shows the simulated level. The ramp
 * below is kept for older callers and fallbacks; the text about "one ramp, one meaning" describes the earlier design.
 *
 * NeuroSurge shared simulated-activity colour ramp (round 2, owner U2a-brain) and, since round 4 (R4-access, D9), the
 * identity KEY_COLORS (left-arm light blue / cyan, other-areas grey, outlines, gold marks) chosen to stay
 * distinguishable under colour-vision deficiency. The ramp itself is unchanged in round 4.
 *
 * ONE ramp, ONE meaning: the brain's motor-region activity AND the muscles' activation/contraction colours both come from
 * this module, so the same colour means the same simulated, unitless activity level everywhere (user requirement R2:
 * the brain's electrical-activity colour coding corresponds to the colour-coded contraction of the muscles).
 *
 * Pure, dependency-free ES module (browser and Node); no DOM, no I/O.
 *
 * Ramp: an inferno-like, perceptually ordered ramp, dark indigo -> purple -> crimson -> orange -> vivid yellow.
 * Polish round: the peak was a warm near-white that, on a fully driven muscle, looked like the ivory bone next to it;
 * it is now a saturated yellow (the order, the meaning and "brighter = more" are unchanged).
 * Stops are in LINEAR RGB and interpolation is piecewise linear in linear RGB. The relative luminance
 * (0.2126 R + 0.7152 G + 0.0722 B) of the stops rises strictly (0.0130 < 0.0628 < 0.1747 < 0.4281 < 0.8621), so the
 * luminance rises strictly and piecewise-linearly with the activity value: brighter always means more simulated
 * activity, which also keeps the order readable for common colour-vision deficiencies.
 *
 * Recommended use (the "same meaning" rule): activity is an EMISSIVE glow added on top of the lit base surface
 * (region tint on the brain, tissue colour on a muscle), not a replacement albedo. activityShade(base, v) returns both
 * terms; activityEmission(v) is the glow alone; activityGlsl() emits the identical ramp for shaders.
 *
 * Scientific limits: every value is a simulated, unitless display drive. It is not measured neural activity, not EMG,
 * not force and not a nerve recording. EMG is not nerve activity or force.
 */

const freeze = Object.freeze;
const clamp01 = x => (x > 1 ? 1 : x > 0 ? x : 0);
const finite01 = v => (Number.isFinite(v) ? clamp01(v) : 0);

/** Legend label shared by every activity legend. */
export const RAMP_LABEL = 'simulated activity (unitless)';

/** Ramp stops in LINEAR RGB, evenly spaced in t (0, 0.25, 0.5, 0.75, 1). */
export const RAMP_STOPS_LINEAR = freeze([
  freeze([0.012, 0.010, 0.045]), // dark indigo (no simulated activity)
  freeze([0.160, 0.012, 0.280]), // purple
  freeze([0.640, 0.045, 0.090]), // crimson
  freeze([1.000, 0.300, 0.012]), // orange
  freeze([1.000, 0.900, 0.080])  // vivid yellow (peak; distinct from the ivory bone colour)
]);

/** Relative luminance of a linear-RGB colour. */
export const luminanceLinear = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** sRGB transfer: linear 0..1 -> encoded 0..1 (clamped). */
export function linearToSrgb(x) {
  const c = clamp01(x);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** sRGB transfer inverse: encoded 0..1 -> linear 0..1 (clamped). */
export function srgbToLinear(x) {
  const c = clamp01(x);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const byte = x => Math.round(clamp01(x) * 255);
const hexOfSrgb = s => (byte(s[0]) << 16) | (byte(s[1]) << 8) | byte(s[2]);
const cssOfHex = h => `#${h.toString(16).padStart(6, '0')}`;

/** sRGB hex integer (0xRRGGBB, the Three.js Color.setHex convention) -> linear RGB [r, g, b]. */
export function hexToLinear(hex) {
  if (!Number.isInteger(hex) || hex < 0 || hex > 0xffffff) throw new Error(`ns:colors_hex: ${hex} is not a 0xRRGGBB integer`);
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}

/** Simulated-activity colour in LINEAR RGB for v in 0..1 (v is clamped; a non-finite v counts as 0). Returns a new
 * [r, g, b] array with every channel in 0..1. */
export function activityColor(v) {
  const n = RAMP_STOPS_LINEAR.length - 1;
  const x = finite01(v) * n;
  if (x >= n) { const e = RAMP_STOPS_LINEAR[n]; return [e[0], e[1], e[2]]; }
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP_STOPS_LINEAR[i], b = RAMP_STOPS_LINEAR[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** The same colour sRGB-encoded (display) [r, g, b] in 0..1. */
export function activityColorSrgb(v) {
  const l = activityColor(v);
  return [linearToSrgb(l[0]), linearToSrgb(l[1]), linearToSrgb(l[2])];
}

/** The same colour as an sRGB hex INTEGER 0xRRGGBB (use with THREE.Color.setHex / new THREE.Color(hex)). For CSS use
 * activityColorCss. */
export function activityColorHex(v) {
  return hexOfSrgb(activityColorSrgb(v));
}

/** The same colour as a CSS '#rrggbb' string. */
export function activityColorCss(v) {
  return cssOfHex(activityColorHex(v));
}

function stopRecord(t) {
  const rgb = freeze(activityColor(t));
  const srgb = freeze(activityColorSrgb(t));
  const hex = hexOfSrgb(srgb);
  return freeze({ t, rgb, srgb, hex, css: cssOfHex(hex) });
}

/** The ramp's own stops: frozen [{ t, rgb (linear), srgb, hex (0xRRGGBB), css ('#rrggbb') }], t = 0, 0.25, .., 1. */
export const RAMP_STOPS = freeze(RAMP_STOPS_LINEAR.map((_, i) => stopRecord(i / (RAMP_STOPS_LINEAR.length - 1))));

/** n >= 2 evenly spaced legend stops (same record shape as RAMP_STOPS), t from 0 to 1. Use at least 9 (two per ramp
 * segment) so a CSS gradient, which interpolates in sRGB, follows the linear-RGB ramp the shaders draw. */
export function rampLegendStops(n = 9) {
  if (!(Number.isInteger(n) && n >= 2)) throw new Error('ns:colors_legend: n must be an integer >= 2');
  const out = [];
  for (let i = 0; i < n; i++) out.push(stopRecord(i / (n - 1)));
  return freeze(out);
}

/** CSS background for an activity legend bar: 'linear-gradient(<direction>, <css stop> <pct>%, ...)'. */
export function rampLegendGradientCss(n = 9, direction = 'to right') {
  const stops = rampLegendStops(n).map(s => `${s.css} ${(s.t * 100).toFixed(1)}%`);
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

// ---------------------------------------------------------------------------------------------
// R4-access (round 4, D9): the identity KEY colours, checked for colour-vision deficiency.

/** Identity (key) colours of the motor-area display, kept in ONE place so the brain regions, their outlines and the
 * legend agree and stay distinguishable for colour-blind players. The activity ramp above is NOT changed by this.
 *
 * Why (round4/access/ACCESS-REPORT.md): the "other body part" areas were a cool slate-violet grey. People with
 * protanopia or deuteranopia (no working red or green cones; red-green colour blindness of any degree affects about
 * 8 % of men, the full forms simulated here about 2 %) see that as the same blue-grey as the teal left-arm areas:
 * CIEDE2000 between the rendered rest colours fell from 12.9 (normal vision) to 1.5-1.7 under simulation (Machado 2009
 * and Brettel 1997 models; Chromium's own emulation 1.2 / 1.5), i.e. the left-arm / other-areas distinction
 * disappeared. The other
 * areas are now a neutral-warm grey (it reads yellowish-grey to those players) and the left-arm fill a light sky blue
 * (it reads clearly blue to them); the cyan outline, label and spots of the left arm are unchanged. Rendered result
 * (same views, same render, 1280x720): worst case over the six simulations 10.7 at rest and 10.5 once switched on
 * (was 1.5 and 2.3); normal vision 13.1 (was 12.9); Chromium's own emulation 10.3 / 12.1 / 17.2 (protanopia /
 * deuteranopia / tritanopia; was 1.2 / 1.5 / 12.6). The outlines and the legend
 * swatches move with them (the lavender outline was 3.0 from the cyan one under deuteranopia).
 *
 * Units: tints are LINEAR RGB 0..1 (they multiply the lighting like REGION_STYLE tints); lines are sRGB 0xRRGGBB
 * (Three.js Color.setHex); legend swatches are CSS colours. Display choices only: no tissue or signal meaning.
 * Wiring (the integrator; exact steps in round4/R4-access-NOTES.md): ns-brain REGION_STYLE.leftArmTint / otherTint /
 * otherTintAlt, ns-scene-three REGION_RENDER.groupLine / otherLine and REGION_STYLE_FALLBACK, CSS --ns-other and the
 * two legend swatch backgrounds take these values. */
export const KEY_COLORS = freeze({
  /** Light-blue left-arm areas (right hemisphere; sRGB #59c4f9 before lighting). Round 3: [0.10, 0.52, 0.62] (teal). */
  leftArmTint: freeze([0.10, 0.55, 0.95]),
  /** Warm grey areas of every other body part (even strip order). Round 3: [0.33, 0.33, 0.45] (slate-violet). */
  // R558 (genuine note R32: the motor areas should be "clearer" and "at least look a little fleshy"): the other body
  // parts' areas are now a soft tissue pink instead of warm grey (grey was the least tissue-like part of the brain).
  // Still far from the left arm's light blue in hue and in lightness, also for red-green colour-blind players (the
  // difference is on the blue / yellow axis). Was [0.345, 0.300, 0.232].
  otherTint: freeze([0.560, 0.300, 0.290]),
  /** The darker alternate grey (odd strip order), same ratio as before. Round 3: [0.27, 0.27, 0.37]. */
  otherTintAlt: freeze([0.470, 0.250, 0.245]),
  /** Left-arm territory outline, CSS --ns-leftarm (unchanged). */
  leftArmLine: 0x8cf2ff,
  /** Other body-part territory outline, CSS --ns-other. Round 3: 0xd2cdf0 (lavender). */
  otherGroupLine: 0xd4ccbc,
  /** Faint per-region borders of the other areas. Round 3: 0xb9b4d6. */
  otherLine: 0xc4bcae,
  /** Gold edge of a switched-on ("activated") area until Reset body, CSS --ns-activated (unchanged). */
  markLine: 0xffc65c,
  /** Legend swatch fills (CSS), matched to the rendered areas. Round 3: rgba(64, 108, 118, 0.95) / rgba(104, 106, 116, 0.95). */
  legendSwatchLeftArm: 'rgba(64, 109, 133, 0.95)',
  legendSwatchOther: 'rgba(105, 103, 97, 0.95)'
});

/** CSS '#rrggbb' of an sRGB 0xRRGGBB integer key colour (e.g. keyColorCss(KEY_COLORS.otherGroupLine) === '#d4ccbc'). */
export function keyColorCss(hex) {
  if (!Number.isInteger(hex) || hex < 0 || hex > 0xffffff) throw new Error(`ns:colors_hex: ${hex} is not a 0xRRGGBB integer`);
  return cssOfHex(hex);
}

// ---------------------------------------------------------------------------------------------
// The shared "same meaning" shading rule: activity is an emissive glow over a lit base.

/** Shared activity-glow constants (unitless display factors).
 *  - riseTo: the glow factor rises smoothly from 0 at v = 0 to 1 at v >= riseTo, so tiny residual drives do not glow;
 *  - darken / darkenEnd: base albedo x (1 - darken * smoothstep(0, darkenEnd, v)), so at high activity the ramp glow,
 *    not the lit base, carries the colour and it reads like the legend. */
export const ACTIVITY_GLOW = freeze({ riseTo: 0.2, darken: 0.85, darkenEnd: 0.6 });

/** GLSL-compatible smoothstep. */
export function smoothstep(e0, e1, x) {
  const t = (x - e0) / (e1 - e0);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Glow factor 0..1 for activity v (smoothstep(0, ACTIVITY_GLOW.riseTo, v)). */
export function activityGlowFactor(v, glow = ACTIVITY_GLOW) {
  return smoothstep(0, glow.riseTo, finite01(v));
}

/** Emissive glow (linear RGB) for activity v: activityColor(v) x activityGlowFactor(v). [0, 0, 0] at v = 0. */
export function activityEmission(v, glow = ACTIVITY_GLOW) {
  const c = activityColor(v), g = activityGlowFactor(v, glow);
  return [c[0] * g, c[1] * g, c[2] * g];
}

/** The shared shading rule for a surface whose base (linear RGB) is `baseLinear` at activity v:
 * { albedo: base x (1 - darken * smoothstep(0, darkenEnd, v)), emission: activityEmission(v) }. The brain regions and
 * the muscles should both use this so equal activity looks equal. */
export function activityShade(baseLinear, v, glow = ACTIVITY_GLOW) {
  if (!baseLinear || baseLinear.length !== 3) throw new Error('ns:colors_shade: baseLinear must be [r, g, b]');
  const a = finite01(v);
  const k = 1 - glow.darken * smoothstep(0, glow.darkenEnd, a);
  return { albedo: [baseLinear[0] * k, baseLinear[1] * k, baseLinear[2] * k], emission: activityEmission(a, glow) };
}

const glslFloat = x => {
  const s = Number(x).toFixed(6);
  return s.includes('.') ? s : `${s}.0`;
};

/** GLSL source of `vec3 <name>(float v)` (linear RGB, v clamped) evaluating exactly this ramp, plus
 * `float <name>Glow(float v)` (the activityGlowFactor rule). Paste into a shader chunk so shaders and the CPU agree. */
export function activityGlsl(name = 'nsActivityColor', glow = ACTIVITY_GLOW) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('ns:colors_glsl: name must be a GLSL identifier');
  const n = RAMP_STOPS_LINEAR.length - 1;
  const v3 = c => `vec3(${glslFloat(c[0])}, ${glslFloat(c[1])}, ${glslFloat(c[2])})`;
  const lines = [`vec3 ${name}(float v) {`, `  float x = clamp(v, 0.0, 1.0) * ${glslFloat(n)};`];
  for (let i = 0; i < n; i++) {
    const a = RAMP_STOPS_LINEAR[i], b = RAMP_STOPS_LINEAR[i + 1];
    const cond = i < n - 1 ? `if (x < ${glslFloat(i + 1)}) ` : '';
    lines.push(`  ${cond}return mix(${v3(a)}, ${v3(b)}, x - ${glslFloat(i)});`);
  }
  lines.push('}');
  lines.push(`float ${name}Glow(float v) { return smoothstep(0.0, ${glslFloat(glow.riseTo)}, clamp(v, 0.0, 1.0)); }`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// R5-access (round 5, D17): the FLUORESCENT GLOW variant of the same ramp, for the glow links between an active brain
// area and the muscles it drives, and for the glowing areas and muscles themselves.
//
// Same ramp, same meaning: every glow stop is the ramp stop with the SAME chromaticity (each linear-RGB stop is only
// multiplied by a positive number, so its hue and saturation are kept exactly), only brighter at the low and middle end
// so a lit link shows in front of the near-black background. The brightness (relative luminance) of the stops still
// rises strictly (0.06 < 0.14 < 0.25 < 0.428 < 0.862, the last two are the ramp's own orange and yellow), so brighter
// still means more simulated activity, also for colour-blind players. Hue order: indigo -> purple -> crimson -> orange
// -> yellow, exactly as the legend.
//
// How strongly something glows follows the activity too (glowIntensity: 0 below GLOW.onset, so a resting muscle's
// 0.08 drive never glows; then rising with v). Display choices only: the glow is a picture of which area drives which
// muscles IN THIS SIMULATION, not a nerve path and not a measurement (real signals go brain -> spinal cord -> nerves
// -> muscle). Evidence and colour-vision checks: round5/access/ACCESS-REPORT.md.

const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

/** Target relative luminance of the five glow stops (t = 0, 0.25, 0.5, 0.75, 1). The last two equal the ramp's own
 * orange and yellow (they are already at full brightness). */
export const GLOW_STOP_LUMINANCE = freeze([0.06, 0.14, 0.25, luminanceLinear(RAMP_STOPS_LINEAR[3]), luminanceLinear(RAMP_STOPS_LINEAR[4])]);

/** Glow stops in LINEAR RGB: RAMP_STOPS_LINEAR[i] x (GLOW_STOP_LUMINANCE[i] / its luminance). Every channel stays in
 * 0..1 (a unit test checks it). Values: [0.0556, 0.0463, 0.2084] violet-indigo, [0.3566, 0.0267, 0.6241] purple,
 * [0.9156, 0.0644, 0.1288] crimson, then the ramp's orange and yellow. */
export const GLOW_STOPS_LINEAR = freeze(RAMP_STOPS_LINEAR.map((c, i) => {
  const k = GLOW_STOP_LUMINANCE[i] / luminanceLinear(c);
  return freeze([c[0] * k, c[1] * k, c[2] * k]);
}));

/** Glow constants (unitless display factors; alphas are for ADDITIVE blending over the scene).
 *  - onset / onsetFull: the glow gate opens smoothly between these drives (resting muscles at 0.08 never glow);
 *  - floor: intensity = gate x (floor + (1 - floor) x v), so a weak but real activation still shows a faint link;
 *  - coreWhite: the centre line of a link is whitened by coreWhite x intensity (the "fluorescent tube" look); the halo
 *    around it keeps the pure ramp colour, so the colour (activity level) stays readable;
 *  - linkAlpha / haloAlpha / particleAlpha: peak additive alpha of the link core, its soft halo and stream particles;
 *  - areaRimGain / muscleRimGain / rimPower: a fresnel rim of glowColor(v) x intensity x gain x (1 - |N.V|)^rimPower
 *    ADDED as emission on an active brain area / driven muscle, on top of the existing activityShade (which is kept);
 *  - overBrainCore / overBrainHalo: multipliers of linkAlpha / haloAlpha on the part of a link that lies over the drawn
 *    brain outline on screen (from the active area to where the link leaves the outline): there it is only a thin
 *    core thread, so it never hides the other motor areas (rendered 1280x720: brain pixels changed by the links fell
 *    from 4.6 % to 1.8 %); the full fluorescent halo starts once the link is off the brain;
 *  - riseTau / decayTau (s): optional smoothing of the glow strength (stepGlow), so a link does not blink;
 *  - textBackdropMinAlpha: any HUD text box a link can pass behind needs a backdrop of at least this alpha in the
 *    --ns-bg colour while a link is shown, so its dimmest text (#9fb0c4, needs 0.78) keeps 4.5:1 even over a link core
 *    that saturates to white (glowTextSafety computes it; the round-4 status card is 0.42, the info panel 0.84). */
export const GLOW = freeze({
  onset: 0.1, onsetFull: 0.2, floor: 0.3, coreWhite: 0.18,
  linkAlpha: 1, haloAlpha: 0.6, particleAlpha: 0.9, overBrainCore: 0.5, overBrainHalo: 0,
  areaRimGain: 0.9, muscleRimGain: 0.8, rimPower: 2,
  riseTau: 0.05, decayTau: 0.15,
  textBackdropMinAlpha: 0.78
});

/** Fluorescent glow colour (LINEAR RGB, channels 0..1) for activity v (clamped; non-finite counts as 0): piecewise
 * linear between GLOW_STOPS_LINEAR, like activityColor. Same hue order and meaning as the legend. */
export function glowColor(v) {
  const n = GLOW_STOPS_LINEAR.length - 1;
  const x = finite01(v) * n;
  if (x >= n) { const e = GLOW_STOPS_LINEAR[n]; return [e[0], e[1], e[2]]; }
  const i = Math.floor(x);
  return lerp3(GLOW_STOPS_LINEAR[i], GLOW_STOPS_LINEAR[i + 1], x - i);
}

/** The glow colour sRGB-encoded [r, g, b] 0..1, as a 0xRRGGBB integer, and as a CSS '#rrggbb' string. */
export function glowColorSrgb(v) { const l = glowColor(v); return [linearToSrgb(l[0]), linearToSrgb(l[1]), linearToSrgb(l[2])]; }
export function glowColorHex(v) { return hexOfSrgb(glowColorSrgb(v)); }
export function glowColorCss(v) { return cssOfHex(glowColorHex(v)); }

/** Glow strength 0..1 for activity v: smoothstep(onset, onsetFull, v) x (floor + (1 - floor) x v). 0 for v <= onset
 * (so the resting 0.08 never glows), 1 at v = 1, never decreasing. */
export function glowIntensity(v, glow = GLOW) {
  const a = finite01(v);
  return smoothstep(glow.onset, glow.onsetFull, a) * (glow.floor + (1 - glow.floor) * a);
}

/** Additive emission (LINEAR RGB) of a glowing link, rim or particle at activity v: glowColor(v) x glowIntensity(v) x
 * gain. [0, 0, 0] when nothing is active. */
export function glowEmission(v, gain = 1, glow = GLOW) {
  const c = glowColor(v), k = glowIntensity(v, glow) * gain;
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** Colour of a link's bright centre line at activity v (LINEAR RGB): glowColor(v) whitened by coreWhite x intensity. */
export function glowCoreColor(v, glow = GLOW) {
  return lerp3(glowColor(v), [1, 1, 1], glow.coreWhite * glowIntensity(v, glow));
}

/** Colour along a link at s in 0..1 from the active brain area (s = 0, activity vArea) to a driven muscle (s = 1,
 * activity vMuscle): glowColor of the interpolated activity, so each end shows the colour of what it touches. */
export function glowLinkColor(vArea, vMuscle, s) {
  const f = finite01(s);
  return glowColor(finite01(vArea) * (1 - f) + finite01(vMuscle) * f);
}

/** Halo profile across a link (or around a glowing spot). r = distance from the centre line / the halo half-width.
 * 1 inside the core (r <= core), then a soft gaussian falloff that reaches exactly 0 at r = 1 (no hard edge). */
export const GLOW_HALO = freeze({ core: 0.22, falloff: 3, cutoffStart: 0.8 });
export function glowHaloProfile(r, halo = GLOW_HALO) {
  const x = Number.isFinite(r) ? Math.abs(r) : 1;
  if (x >= 1) return 0;
  if (x <= halo.core) return 1;
  const u = (x - halo.core) / (1 - halo.core);
  return Math.exp(-halo.falloff * u * u) * (1 - smoothstep(halo.cutoffStart, 1, x));
}

/** Fluorescent rim emission (LINEAR RGB) of an active brain area or driven muscle: glowColor(v) x glowIntensity(v) x
 * gain x (1 - facing)^rimPower, where facing = |N.V| (1 = surface faces the camera, 0 = silhouette). ADD it to the
 * surface's existing activityShade emission (gain GLOW.areaRimGain on a brain area, GLOW.muscleRimGain on a muscle). */
export function glowRim(facing, v, gain = 1, glow = GLOW) {
  const f = Number.isFinite(facing) ? clamp01(Math.abs(facing)) : 1;
  const k = glowIntensity(v, glow) * gain * Math.pow(1 - f, glow.rimPower);
  const c = glowColor(v);
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** First-order smoothing of a glow strength toward `target` over dtS seconds (exact exponential; riseTau when rising,
 * decayTau when falling). Optional: use it so a link fades out over ~0.15 s instead of vanishing in one frame. */
export function stepGlow(prev, target, dtS, glow = GLOW) {
  const p = Number.isFinite(prev) ? prev : 0, t = Number.isFinite(target) ? target : 0;
  const dt = Number.isFinite(dtS) && dtS > 0 ? dtS : 0;
  const tau = t >= p ? glow.riseTau : glow.decayTau;
  return tau > 0 ? t + (p - t) * Math.exp(-dt / tau) : t;
}

/** GLSL source for the glow: `vec3 <name>Color(float v)` (glowColor), `float <name>Intensity(float v)`,
 * `vec3 <name>Core(float v)`, `float <name>Halo(float r)` and `vec3 <name>Rim(float facing, float v, float gain)`
 * (facing = |N.V|; the fluorescent rim of glowRim). Paste into a shader so shaders and the CPU agree. */
export function glowGlsl(name = 'nsGlow', glow = GLOW, halo = GLOW_HALO) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('ns:colors_glsl: name must be a GLSL identifier');
  const n = GLOW_STOPS_LINEAR.length - 1;
  const v3 = c => `vec3(${glslFloat(c[0])}, ${glslFloat(c[1])}, ${glslFloat(c[2])})`;
  const f = glslFloat;
  const lines = [`vec3 ${name}Color(float v) {`, `  float x = clamp(v, 0.0, 1.0) * ${f(n)};`];
  for (let i = 0; i < n; i++) {
    const cond = i < n - 1 ? `if (x < ${f(i + 1)}) ` : '';
    lines.push(`  ${cond}return mix(${v3(GLOW_STOPS_LINEAR[i])}, ${v3(GLOW_STOPS_LINEAR[i + 1])}, x - ${f(i)});`);
  }
  lines.push('}');
  lines.push(`float ${name}Intensity(float v) { float a = clamp(v, 0.0, 1.0); return smoothstep(${f(glow.onset)}, ${f(glow.onsetFull)}, a) * (${f(glow.floor)} + ${f(1 - glow.floor)} * a); }`);
  lines.push(`vec3 ${name}Core(float v) { return mix(${name}Color(v), vec3(1.0), ${f(glow.coreWhite)} * ${name}Intensity(v)); }`);
  lines.push(`float ${name}Halo(float r) { float x = abs(r); if (x >= 1.0) return 0.0; if (x <= ${f(halo.core)}) return 1.0; float u = (x - ${f(halo.core)}) / ${f(1 - halo.core)}; return exp(-${f(halo.falloff)} * u * u) * (1.0 - smoothstep(${f(halo.cutoffStart)}, 1.0, x)); }`);
  lines.push(`vec3 ${name}Rim(float facing, float v, float gain) { return ${name}Color(v) * (${name}Intensity(v) * gain * pow(clamp(1.0 - facing, 0.0, 1.0), ${f(glow.rimPower)})); }`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// R5-access: small WCAG helpers (pure) so the HUD rules below can be checked in unit tests.

const wcagLum = hex => {
  const l = hexToLinear(hex);
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};

/** WCAG 2.x contrast ratio of two sRGB 0xRRGGBB colours (1..21). */
export function contrastRatioHex(a, b) {
  const la = wcagLum(a), lb = wcagLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** sRGB 0xRRGGBB of `fg` drawn with alpha a over `bg` (browser compositing happens on the encoded values). */
export function compositeOverHex(fg, a, bg) {
  const al = finite01(a);
  const ch = (h, s) => (h >> s) & 255;
  const mix = s => Math.round(ch(fg, s) * al + ch(bg, s) * (1 - al));
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** Text readability over a glow (D17: "never makes text unreadable behind it"). A HUD box with backdrop colour
 * `backdrop` at alpha `alpha` sits over the WebGL canvas; the worst case under it is `worstBehind` (default 0xffffff:
 * an additive link core can saturate to white). Returns { ratio (text over the composited box), ok (>= minRatio),
 * minAlpha (smallest backdrop alpha that keeps minRatio over worstBehind, or null if no alpha can) }. */
export function glowTextSafety({ text, backdrop = 0x05070b, alpha, worstBehind = 0xffffff, minRatio = 4.5 } = {}) {
  if (!Number.isInteger(text) || !Number.isInteger(backdrop) || !Number.isInteger(worstBehind)) throw new Error('ns:colors_text: text, backdrop and worstBehind must be 0xRRGGBB integers');
  const ratio = contrastRatioHex(text, compositeOverHex(backdrop, alpha, worstBehind));
  let minAlpha = null;
  if (contrastRatioHex(text, backdrop) >= minRatio) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (contrastRatioHex(text, compositeOverHex(backdrop, m, worstBehind)) >= minRatio) hi = m; else lo = m; }
    minAlpha = Math.ceil(hi * 1000) / 1000;
  }
  return { ratio, ok: ratio >= minRatio, minAlpha };
}

// ---------------------------------------------------------------------------------------------
// R5-access (round 5, D16 / D19): colours of the 3D compass orbit arrows (around the brain and around the mirror body)
// and of the mirror body as seen through the glass brain. Evidence: round5/access/ACCESS-REPORT.md (nominal tables
// under six colour-vision simulations and rendered prototypes in harness/run-R5-access-*).
//
// Field names: `base` is the main lit colour of an arrow (its near end / head; THREE MeshStandardMaterial `color`),
// `far` the dimmer far end of the stalk (the ns-arrows3d near-bright / far-dim depth cue), `rim` its fresnel rim
// light. arrowLook(kind) maps them onto the ns-arrows3d ARROW_LOOK field names.
//
// Why these values:
//  - Brain arrows: a pale cool white head (CIELAB L* 94) with a DARK outline (inflated back faces, at least
//    outline.minPx on screen). A light body plus a dark outline keeps at least 4.1:1 against ANY backdrop (the body
//    against the dark glass and background, the outline against the ivory bone or a white glow): WCAG 1.4.11 (3:1).
//  - Mirror arrows: a mid-tone green (head L* 66, far end L* 56). Green is used nowhere else in the game, and its
//    lightness is far below the white brain arrows, so the two sets stay apart for every colour vision (lightness
//    survives all three dichromacies): worst case 24.5 CIEDE2000 from the brain arrows, >= 14 from bone, gold, the
//    left-arm cyan, a lit muscle and the ramp under six simulations. A lighter teal (#4fd6a6, tried first) became the
//    bone's beige under protanopia / deuteranopia and the left-arm cyan under tritanopia (rendered, viewed): rejected.
//    The mirror arrows are also smaller (ns-arrows3d ARROW_TIP_SIZES) and sit around the mirror body: never colour alone.
//    Known limit: under tritanopia (very rare) the green reads as a mid blue, like the left-arm family (17.8 from the
//    cyan line); shape, size and place still tell them apart.
//  - Hover (both sets): a warm white mixed in at hover.mix (the ns-arrows3d rule), plus 12 % larger and a stronger rim.
//    Not yellow: a yellow hover (the round-4 #ffe066) came within 3.7 of the gold "switched on" mark (protanopia) on
//    the mirror arrows and within 2.4 of the strongest-muscle yellow; warm white stays >= 13.5 / 6 away. The hover
//    colour change itself is modest (7.5 brain, 10.3 mirror, worst case), so the size and rim cues carry it.
//  - Occluded parts (the near arm in front of an arrow): drawn again only where something is in front (depthFunc
//    Greater): the arrow's own colour as a faint fill plus a fresnel rim, and a DARK ring (outline colour,
//    darkEdgeOpacity) just outside it. A light rim alone: 4.3:1 on muscle but 1.2:1 on the ivory bone; with the dark
//    ring the better of the two is >= 4.3:1 on muscle, bone and a fully lit muscle.
// Display choices only (no tissue or signal meaning).
export const ARROW_COLORS = freeze({
  brain: freeze({ base: 0xe9eef4, far: 0x6f7c8c, rim: 0xcfe0ff, emissive: 0x2c3038, roughness: 0.4, metalness: 0 }),
  mirror: freeze({ base: 0x53b27f, far: 0x45966b, rim: 0xbfe8cf, emissive: 0x10281b, roughness: 0.45, metalness: 0 }),
  hover: freeze({ base: 0xfff1cf, mix: 0.55, emissive: 0x4a4436 }),
  outline: freeze({ color: 0x05070b, opacity: 0.92, minPx: 2 }),
  occluded: freeze({ fillOpacity: 0.22, edgeOpacity: 0.7, darkEdgeOpacity: 0.7 })
});

/** Colours for ns-arrows3d createArrowRig(THREE, { kind, look: { ...ARROW_LOOK, ...arrowLook(kind) } }) (kind
 * 'brain' | 'mirror'): { base (far end), tip (head), hover, rim, outlineColor, xrayOpacity, xrayDarkOpacity }.
 * xrayOpacity is occluded.edgeOpacity: that shader draws xrayOpacity x (0.45 + 0.55 x rim), i.e. about 0.3 in the
 * middle and edgeOpacity at the silhouette. xrayDarkOpacity (occluded.darkEdgeOpacity) is the alpha of the dark
 * outermost silhouette band in the proposed two-tone x-ray shader (round5/R5-access-NOTES.md step B2); ARROW_LOOK has
 * no such field yet, so it is ignored until that shader is wired. */
export function arrowLook(kind = 'brain') {
  const c = ARROW_COLORS[kind];
  if (!c || (kind !== 'brain' && kind !== 'mirror')) throw new Error(`ns:colors_arrow: kind must be 'brain' or 'mirror' (got ${kind})`);
  return freeze({ base: c.far, tip: c.base, hover: ARROW_COLORS.hover.base, rim: c.rim, outlineColor: ARROW_COLORS.outline.color, xrayOpacity: ARROW_COLORS.occluded.edgeOpacity, xrayDarkOpacity: ARROW_COLORS.occluded.darkEdgeOpacity });
}

/** Mirror body as seen through the glass brain (D19).
 *  - regionBacking: the motor areas are translucent (rest opacity 0.3), so the mirror body behind the brain would show
 *    through them and change their colours (rendered: a resting grey area shifted by up to 29.6 CIEDE2000, reading as a
 *    lighter, pinker "switched-on" shade). Let the region DEPTH pre-pass (ns-scene-three regionDepthMaterial, drawn
 *    after the mirror and before the area colours) also write this colour at this alpha: what is behind an area is
 *    dimmed before the area's own colour is drawn. With nothing behind the brain (dark background) nothing changes;
 *    with the mirror behind, no area target moved by more than 2 (rendered), while the mirror stays visible through the
 *    clear glass (85 % of its pixels).
 *  - accent: the mirror's identity colour for its label / info-panel accent (= the mirror arrows' green). */
export const MIRROR_VIEW = freeze({
  // R558 (R32): a dark red-brown under the now more solid areas, like tissue seen in depth (was the near-black 0x05070b).
  // R558 (Message 22, "clinical and surgical"): a neutral mid-dark slate instead (OKLCH 0.30 0.012 240, #252d33), so
  // nothing under the areas reads as blood and the translucent areas look clean and light rather than muddy; the areas
  // keep their colours (the backing only dims what is behind them, as before).
  regionBacking: freeze({ color: 0x252d33, alpha: 0.85 }),
  accent: 0x53b27f
});

// ---------------------------------------------------------------------------------------------
// R558 (user Message 2: "make the glow look like an optogenetic glow activation but with different colors/shades for
// each area with the same corresponding color/shade across all 3 items for clarity"): ONE colour per motor area, used
// by the brain area, the muscles it drives on your body and the same muscles on the mirror body.
//
// Design (display choices; no tissue or signal meaning):
//  - One hue family per body part, the left and right halves of the body on the two ends of the warm-cool axis (the
//    blue-yellow axis survives red-green colour blindness): left arm blues (areas in the brain's right half), right arm
//    oranges (left half), left leg purples, right leg yellows, belly and back greens (right half a bluish green, left
//    half a yellowish green), face and neck pinks (right half orchid, left half rose). The in-between (SCAN) areas, which
//    move nothing, are a dim neutral grey (a little cool in the right half, a little warm in the left).
//  - Within a family the sub-areas alternate light and dark along the strip while the hue drifts, so neighbouring areas
//    read apart at rest; mirrored areas (left elbow and right elbow) are far apart in hue.
//  - `color` is the identity colour (sRGB 0xRRGGBB): legend swatches and the calm resting tint of the area. `glow` is the
//    same hue brighter and more saturated (largest channel 255): the light-activated look of the area and its muscles.
//  - Computed from OKLCH (lightness, chroma, hue) per area, gamut-clipped; the hex values below are the record.
//    Checked (OKLab distance, 0.1 = clearly different; Machado 2009 simulation at full severity): mirrored limb areas
//    >= 0.168 apart for normal vision, protanopia, deuteranopia and tritanopia (glow colours >= 0.138); neighbours on the
//    strip >= 0.052 under every simulation. Areas of DIFFERENT families far apart on the strip can still look alike to
//    a dichromat (two cone types cannot separate six hues): their place on the strip and the moving body part tell
//    them apart there.
// Every value stays a simulated, unitless display drive; the colour says WHICH area, the brightness HOW MUCH.

// R558 (user, Message 17: "clear fluorescent glow correspondence across all 3 systems during activation"): the glow is
// made VIVID: AREA_GLOW_VIVID of the white (the smallest linear channel) is taken out of the recorded glow colour and
// the result renormalised to a largest channel of 1, so a light shade lights up as a saturated, light-like colour of the
// same hue instead of a pastel. The recorded hex values stay the identity record; glowLinear / glowCss are the vivid ones.
export const AREA_GLOW_VIVID = 0.6;
const vividLinear = c => {
  const lo = Math.min(c[0], c[1], c[2]) * AREA_GLOW_VIVID;
  const v = c.map(x => Math.max(0, x - lo)), hi = Math.max(v[0], v[1], v[2]) || 1;
  return v.map(x => x / hi);
};
const linearToCss = c => '#' + c.map(x => { const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'); }).join('');
const area = (family, color, glow) => {
  const g = vividLinear(hexToLinear(glow));
  return freeze({
    family, color, glow, css: cssOfHex(color), glowCss: linearToCss(g),
    colorLinear: freeze(hexToLinear(color)), glowLinear: freeze(g)
  });
};

/** The 54 motor areas (ns-bodymap region ids, both hemispheres) -> { family, color, glow (sRGB 0xRRGGBB), css, glowCss,
 * colorLinear, glowLinear }. R558 (Message 14): the little, ring and middle finger, nose and throat areas of each half
 * are new; their colours are PROVISIONAL picks in the same scheme (family hue, alternating light and dark along the
 * strip; OKLab distance to each strip neighbour 0.077-0.27, mirrored finger areas 0.19-0.32 apart), not run through
 * the OKLCH generator and dichromat check the other entries were; lh_fingers is now lh_index (same colour). */
export const AREA_COLORS = freeze({
  rh_toes: area('leftLeg', 0xa19eff, 0xafaeff),
  rh_ankle: area('leftLeg', 0x8161d4, 0x9261ff),
  rh_knee: area('leftLeg', 0xae7aee, 0xbd88ff),
  rh_hip: area('leftLeg', 0x8c47b1, 0xc44fff),
  rh_scan_superior: area('scan', 0x78818b, 0xddeeff),
  rh_trunk: area('trunk', 0x05995a, 0x19ff9b),
  rh_shoulder: area('leftArm', 0x0eb8d1, 0x10e1ff),
  rh_elbow: area('leftArm', 0x148ead, 0x27d3ff),
  rh_forearm: area('leftArm', 0x5bccfe, 0x86d8ff),
  rh_wrist: area('leftArm', 0x0b99dd, 0x11b2ff),
  rh_hand: area('leftArm', 0x6db7fc, 0x8ac6ff),
  rh_little: area('leftArm', 0x2a8fd0, 0x29afff),
  rh_ring: area('leftArm', 0x9fc3fd, 0x80c5ff),
  rh_middle: area('leftArm', 0x3f7fe2, 0x398fff),
  rh_index: area('leftArm', 0xaacdfe, 0xb6d5ff),
  rh_thumb: area('leftArm', 0x5880e6, 0x5f8bff),
  rh_neck: area('faceNeck', 0xed99fa, 0xf4afff),
  rh_scan_middle: area('scan', 0x6d767f, 0xdbecff),
  rh_brow: area('faceNeck', 0xc26cc7, 0xf675ff),
  rh_eyelid: area('faceNeck', 0xee90ea, 0xff9df9),
  rh_nose: area('faceNeck', 0xd277d9, 0xf770ff),
  rh_lower_face: area('faceNeck', 0xbc5db0, 0xff68ef),
  rh_lips: area('faceNeck', 0xe781d2, 0xff84e7),
  rh_jaw: area('faceNeck', 0xbb54a0, 0xff5bd6),
  rh_tongue: area('faceNeck', 0xe072ba, 0xff6cd0),
  rh_throat: area('faceNeck', 0xa8458a, 0xff54d1),
  rh_scan_inferior: area('scan', 0x616a73, 0xd9ebff),
  lh_toes: area('rightLeg', 0xffe5b2, 0xffc84f),
  lh_ankle: area('rightLeg', 0xe9c01e, 0xffd31b),
  lh_knee: area('rightLeg', 0xf4dd22, 0xffe62a),
  lh_hip: area('rightLeg', 0xbebf22, 0xfeff2d),
  lh_scan_superior: area('scan', 0x877f75, 0xffeedc),
  lh_trunk: area('trunk', 0x4e9d0e, 0x83ff21),
  lh_shoulder: area('rightArm', 0xfc7754, 0xff9073),
  lh_elbow: area('rightArm', 0xd05418, 0xff640e),
  lh_forearm: area('rightArm', 0xfca679, 0xffba97),
  lh_wrist: area('rightArm', 0xd86e05, 0xff830a),
  lh_hand: area('rightArm', 0xfd9320, 0xffa759),
  lh_little: area('rightArm', 0xc96510, 0xff8010),
  lh_ring: area('rightArm', 0xffcd96, 0xffcd78),
  lh_middle: area('rightArm', 0xe08a2c, 0xff9d28),
  lh_index: area('rightArm', 0xfdbc79, 0xffc68d),
  lh_thumb: area('rightArm', 0xb67705, 0xffa910),
  lh_neck: area('faceNeck', 0xff9ac0, 0xffb2ce),
  lh_scan_middle: area('scan', 0x7c7369, 0xffedda),
  lh_brow: area('faceNeck', 0xd9668f, 0xff62a0),
  lh_eyelid: area('faceNeck', 0xfe91af, 0xffa8be),
  lh_nose: area('faceNeck', 0xea7499, 0xff65a7),
  lh_lower_face: area('faceNeck', 0xce5978, 0xff5789),
  lh_lips: area('faceNeck', 0xf97f96, 0xff94a7),
  lh_jaw: area('faceNeck', 0xc95367, 0xff5274),
  lh_tongue: area('faceNeck', 0xec737e, 0xff7c89),
  lh_throat: area('faceNeck', 0xb4475a, 0xff5080),
  lh_scan_inferior: area('scan', 0x70675e, 0xffecd8),
});

/** Hue families in legend order: { key, regions (strip order, right hemisphere first) }. */
export const AREA_FAMILIES = freeze(['leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'trunk', 'faceNeck', 'scan'].map(key =>
  freeze({ key, regions: freeze(Object.keys(AREA_COLORS).filter(id => AREA_COLORS[id].family === key)) })));

/** How the area colours are drawn (unitless display factors).
 *  - tissue / restMix: an area at rest shows its identity colour mixed into the R32 tissue pink (restMix = share of the
 *    identity colour), so it stays fleshy and calm but the player can already see which colour belongs where;
 *  - activatedMix: a switched-on area (until Reset body) moves this far further toward its identity colour;
 *  - areaDarken: the lit albedo of an active area is multiplied by (1 - areaDarken x glow strength), so the emitted
 *    colour, not the lit surface, carries the look (light-activated tissue);
 *  - areaGain / muscleGain: emission = glow colour x glowIntensity(v) x gain (the GLOW onset keeps the resting 0.08
 *    muscle drive dark);
 *  - muscleAlbedo: a glowing muscle's lit albedo also moves toward its glow colour x muscleAlbedo by the glow strength,
 *    so it stays shaded and round (a lit, light-filled belly) instead of a flat painted patch;
 *  - areaRimGain / muscleRimGain: a fresnel rim of the same colour, strongest at the silhouette (the soft halo);
 *  - coreWhite: the brightest glow whitens a little toward its core (the luminous look) without losing its hue;
 *  - hintGain: a muscle lit only by an opposing-action hint (user Message 6, "faintly highlight") glows at this share of
 *    the normal emission and rim, keeps its resting red-brown surface and gets no halo, so the hint stays a faint sheen.
 *  - muscleRimPower: the exponent of the muscles' fresnel rim (areas keep GLOW.rimPower 2): a tighter rim that hugs
 *    the outline instead of washing over a muscle seen at a slant.
 * (The one soft line per newly active area has its own constants: ns-scene-three GLOW_LINK.)
 * Check pass (user Messages 9 and 17, "full, filled-out and plumpy" muscles and a "clear fluorescent glow"): with
 * muscleGain 0.55, muscleAlbedo 0.4 and a broad rim (gain 1.2, power 2) a glowing muscle clipped to one flat colour (the
 * lit cyan of the left arm measured sRGB 88..131 red, 204..255 green, 244..255 blue over the whole belly: a painted strip,
 * not a round belly; the resting red muscles beside it span 65..128 red, a light factor of about 0.3..1.1). Now the
 * emission is a smaller base (0.3), the lit albedo carries the light-to-shadow roll-off (0.5 x the glow colour, so
 * 0.3 + 0.5 x 1.1 stays below clipping) and the rim is tighter (gain 1.0, power 3.5). Tried muscleAlbedo 0.8 with the
 * old rim: no change (still clipped). The active AREAS keep areaDarken 0.45: 0.8 changed a lit area by a few sRGB steps
 * only (the lit left wrist 119, 221, 230 -> 102, 227, 241; the right knee unchanged), because a lit area already shows
 * its glow colour; the light shades of a family simply have light, pastel glow colours (left knee 0xbd88ff). */
export const AREA_LOOK = freeze({
  // R558 (Message 17): calmer resting tints (0.72 -> 0.5 of the identity colour in the tissue pink) and a stronger lit
  // glow (area gain 1.0 -> 1.35), so the switched-on area stands out from its neighbours at a glance.
  // R558 (Message 22, "clinical", "motor areas clean"): a clearer resting identity colour (restMix 0.5 -> 0.62), so the
  // warm families read as clean orange / yellow bands instead of brown and olive; it also separates neighbours more
  // (smallest OKLab distance between strip neighbours at rest 0.038 -> 0.048, mean 0.085 -> 0.103; mirrored areas
  // 0.038 -> 0.048). The lit, active area still stands out by its emitted glow.
  tissue: KEY_COLORS.otherTint, restMix: 0.62, activatedMix: 0.25,
  // R558 (Message 22, clean areas): a faint self-light of the area's own resting tint (restLift x tint, fading out as the
  // activation glow takes over), like a backlit teaching panel: the warm families no longer sink to brown and olive on
  // the side away from the key light. Small enough that a lit area still stands far above it (areaGain 1.35).
  restLift: 0.14,
  areaDarken: 0.45, areaGain: 1.35, areaRimGain: 1.0,
  muscleGain: 0.3, muscleAlbedo: 0.5, muscleRimGain: 1.0, muscleRimPower: 3.5, coreWhite: 0.12, hintGain: 0.3
});

const NO_AREA = null;
const lookupArea = id => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(AREA_COLORS, id) ? AREA_COLORS[id] : NO_AREA);

/** The record of a motor area (AREA_COLORS entry) or null for an unknown id. */
export function areaRecord(regionId) { return lookupArea(regionId); }
/** Identity colour of an area in LINEAR RGB (frozen [r, g, b]) or null. */
export function areaColor(regionId) { const a = lookupArea(regionId); return a ? a.colorLinear : null; }
/** Glow colour of an area in LINEAR RGB (frozen [r, g, b], brightest channel 1) or null. */
export function areaGlowColor(regionId) { const a = lookupArea(regionId); return a ? a.glowLinear : null; }
/** Identity colour as a CSS '#rrggbb' string, or null. */
export function areaColorCss(regionId) { const a = lookupArea(regionId); return a ? a.css : null; }
/** Glow colour as a CSS '#rrggbb' string, or null. */
export function areaGlowCss(regionId) { const a = lookupArea(regionId); return a ? a.glowCss : null; }
/** Family key ('leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'trunk' | 'faceNeck' | 'scan') or null. */
export function areaFamily(regionId) { const a = lookupArea(regionId); return a ? a.family : null; }

// R558 (user Message 18: "We should be able to easily differentiate each brain node"): the resting tint is mixed in
// OKLab with its CHROMA KEPT (the mix's chroma lifted to the mix of the two chromas, same lightness and hue as the OKLab
// mix), so a cool identity colour over the warm tissue pink stays a calm, clear hint of its hue instead of turning grey.
// Measured (OKLCH chroma of the resting tint at restMix 0.5): left-arm blues 0.027-0.072 -> 0.069-0.109 (the left elbow
// was a grey 0.027 next to the left shoulder 0.033), trunk greens 0.056 / 0.082 -> 0.102 / 0.119, left toes 0.071 ->
// 0.099; the warm families (face, right arm, right leg) change by 0.02 or less and the in-between grey areas stay grey
// (0.024-0.036 -> 0.038). Display choice.
export const AREA_REST_KEEP_CHROMA = true;
const okFromLinear = (c, o) => {
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  o[0] = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  o[1] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  o[2] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return o;
};
const okA = [0, 0, 0], okB = [0, 0, 0];
function chromaKeptMix(t, c, m, out) {
  okFromLinear(t, okA); okFromLinear(c, okB);
  const L = okA[0] + (okB[0] - okA[0]) * m;
  let a = okA[1] + (okB[1] - okA[1]) * m, b = okA[2] + (okB[2] - okA[2]) * m;
  const cm = Math.hypot(a, b), cw = Math.hypot(okA[1], okA[2]) * (1 - m) + Math.hypot(okB[1], okB[2]) * m;
  if (cm > 1e-6) { a *= cw / cm; b *= cw / cm; }
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  out[0] = 4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s;
  out[1] = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s;
  out[2] = -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s;
  for (let i = 0; i < 3; i++) out[i] = out[i] < 0 ? 0 : out[i] > 1 ? 1 : out[i];
  return out;
}

/** Calm resting tint (LINEAR RGB) of an area: its identity colour mixed into the tissue pink by restMix, plus
 * activatedMix further toward the identity colour when switched on. Unknown ids give the tissue pink. `out` reused. */
export function areaRestTint(regionId, { activated = false } = {}, out = [0, 0, 0], look = AREA_LOOK) {
  const a = lookupArea(regionId), t = look.tissue;
  const m = a ? Math.min(1, look.restMix + (activated ? look.activatedMix : 0)) : 0;
  const c = a ? a.colorLinear : t;
  if (AREA_REST_KEEP_CHROMA && a && m > 0 && m < 1) return chromaKeptMix(t, c, m, out);
  for (let i = 0; i < 3; i++) out[i] = t[i] + (c[i] - t[i]) * m;
  return out;
}

/** Optogenetic-style emission (LINEAR RGB) of an area, or of a muscle it drives, at activity v: glow colour x
 * glowIntensity(v) x gain, whitened toward its core by coreWhite x intensity. Unknown ids glow a neutral warm white.
 * Returns the intensity (0 when v is at or below GLOW.onset); `out` receives the colour. */
export function areaGlowInto(regionId, v, gain, out, look = AREA_LOOK, glow = GLOW) {
  const a = lookupArea(regionId);
  const c = a ? a.glowLinear : NEUTRAL_GLOW;
  const k = glowIntensity(v, glow);
  const w = look.coreWhite * k, s = k * (Number.isFinite(gain) ? gain : 1);
  for (let i = 0; i < 3; i++) out[i] = (c[i] + (1 - c[i]) * w) * s;
  return k;
}
const NEUTRAL_GLOW = freeze([1.0, 0.86, 0.72]);

/** Same as areaGlowInto, allocating: { color: [r, g, b] linear, intensity }. */
export function areaGlowEmission(regionId, v, gain = 1) {
  const out = [0, 0, 0];
  const intensity = areaGlowInto(regionId, v, gain, out);
  return { color: out, intensity };
}

/** The muscle -> area colour rule (two areas driving one muscle at once): the STRONGER drive wins (score = the area's
 * level x that muscle's weight in it); a tie keeps the earlier entry (map order). Blending was rejected: a mix of two
 * hues is a third hue that belongs to no area. entries [{ regionId, level, weight? }] -> { regionId, score } | null. */
export function strongestArea(entries) {
  let best = null;
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || !lookupArea(e.regionId)) continue;
    const s = finite01(e.level) * (Number.isFinite(e.weight) ? Math.max(0, e.weight) : 1);
    if (!(s > 0)) continue;
    if (!best || s > best.score) best = { regionId: e.regionId, score: s };
  }
  return best;
}

/** Area whose colour a muscle shows when it is driven but no area claims it (for example the palm-turn dance of the
 * Space key, which drives limb rotators without a brain area): by body part and side (side -1 = subject left, +1 =
 * right, 0 = midline; the brain's RIGHT half drives the LEFT side). part: ns-scene-three BODY_PARTS ('leftArm',
 * 'rightArm', 'legs', 'torso', 'neck', 'face') or anything else (null: neutral glow). */
export function bodyPartArea(part, side = 0) {
  const h = side > 0 ? 'lh' : 'rh';
  if (part === 'leftArm') return 'rh_forearm';
  if (part === 'rightArm') return 'lh_forearm';
  if (part === 'legs') return `${h}_hip`;
  if (part === 'torso') return `${h}_trunk`;
  if (part === 'neck') return `${h}_neck`;
  if (part === 'face') return `${h}_lower_face`;
  return null;
}

/** CSS background of a family's legend chip: its identity shades side by side in strip order (the right hemisphere's
 * areas first when the family has areas in both halves). */
export function areaFamilySwatchCss(familyKey) {
  const f = AREA_FAMILIES.find(x => x.key === familyKey);
  if (!f) return null;
  const cs = f.regions.map(id => AREA_COLORS[id].css);
  if (cs.length === 1) return cs[0];
  const stops = cs.map((c, i) => `${c} ${(100 * i / cs.length).toFixed(1)}% ${(100 * (i + 1) / cs.length).toFixed(1)}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/** Legend bar for GLOW STRENGTH (the colour says which area; the brightness how much): n >= 2 CSS colours from the
 * dark resting surface to a bright neutral glow. */
export function glowStrengthLegendStops(n = 9) {
  if (!(Number.isInteger(n) && n >= 2)) throw new Error('ns:colors_legend: n must be an integer >= 2');
  const lo = [0.018, 0.016, 0.02], hi = [1, 0.97, 0.93], out = [];
  for (let i = 0; i < n; i++) {
    // The glow gate (nothing below GLOW.onset) times the activity, without the GLOW.floor jump, so the bar reads as an
    // even "darker = weaker, brighter = stronger" key.
    const t = i / (n - 1), k = smoothstep(GLOW.onset, GLOW.onsetFull, t) * t;
    out.push(cssOfHex(hexOfSrgb(lo.map((c, j) => linearToSrgb(c + (hi[j] - c) * k)))));
  }
  return freeze(out);
}

const cssOfLinear = c => cssOfHex(hexOfSrgb([linearToSrgb(c[0]), linearToSrgb(c[1]), linearToSrgb(c[2])]));

/** CSS colour of an area's swatch at activity v (its calm rest tint mixed toward its glow colour by glowIntensity(v)),
 * or null for an unknown id. For the information panel. */
export function areaSwatchCss(regionId, v = 0) {
  const a = lookupArea(regionId);
  if (!a) return null;
  const r = areaRestTint(regionId), k = glowIntensity(v);
  return cssOfLinear([0, 1, 2].map(i => r[i] + (a.glowLinear[i] - r[i]) * k));
}

/** CSS background of an area's strength meter: from its calm rest tint (0, resting) to its full glow (1), or null. */
export function areaMeterCss(regionId) {
  const a = lookupArea(regionId);
  if (!a) return null;
  return `linear-gradient(to right, ${cssOfLinear(areaRestTint(regionId))}, ${a.glowCss})`;
}

// ---------------------------------------------------------------------------------------------
// R558 (user Message 18: "anatomical realism and accuracy ... easily differentiate each brain node and muscle node from
// each other ... visceral and fleshy but never disgusting (as some things are now, such as the bodies/muscles"): the
// muscle LOOK. Display choices only: no tissue optics, no measured colour of any real muscle.
//
//  - Tones: every muscle mesh draws one of six muscle tones (since Message 22 the clean rose-salmon to soft red-brown of
//    an anatomy model, OKLCH lightness 0.52..0.705, chroma 0.066..0.094, hue 17..40 deg; see MUSCLE_TONES: no purple,
//    no raw-meat or blood red, no tan). The renderer picks the tone
//    per muscle so that touching neighbours get tones far apart (assignMuscleTones), the same tone on the left and the
//    right muscle of a pair (Message 15) and on your body, the mirror body and the left game arm.
//  - Depth: a muscle the stack classification puts in the DEEP storey is drawn darker as a solid shade (deepShade x its
//    tone, linear), the intermediate storey a little darker (intermediateShade); nothing becomes see-through.
//  - Tendon: where a muscle ends on bone (per vertex, from the stack's own anchored ends; see ns-scene-three) the
//    surface turns toward a pearly, slightly glossier tendon white (tendon, tendonMix, tendonRoughnessDrop).
//  - Tissue light: a red-shifted scatter added to the lit muscle (scatterTint x scatterStrength x albedo) so a muscle in
//    shade stays warm instead of grey-black, and a soft darkening toward each muscle's own outline (creaseStrength x
//    (1 - |N.V|)^creasePower) so the groove between two bellies reads as a crease; both act on the LIT colour only,
//    never on the activation glow (Message 17), and the crease eases off on a glowing muscle (glowCreaseRelief).
//  - Fibres: a faint lengthwise striation along each muscle's long axis on near muscles (fades out with distance).
//  - roughness: a faint moist sheen (between the old matte 0.55 and a glossy 0.3).
//  - Sheen: the specular light on a muscle is tinted warm (sheenTint x sheenGain; tendon parts and glowing muscles
//    keep it white): under the cool sky and rim lights a white-blue sheen on red turned near muscles mauve-grey.
const okLchToLinear = (L, C, hDeg) => {
  const h = hDeg * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map(clamp01);
};
const muscleTone = (name, L, C, h) => {
  const lin = okLchToLinear(L, C, h);
  return freeze({ name, oklch: freeze([L, C, h]), lab: freeze([L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)]),
    linear: freeze(lin), hex: hexOfSrgb(lin.map(linearToSrgb)) });
};
/** The six muscle tones (OKLCH is the record; linear RGB and sRGB hex are derived).
 * R558 (user Message 22: "Don't make the bodies look too gruesome and bloody. Make them clinical instead. Everything
 * should look clinical and surgical."): the tones are now those of an anatomy teaching model or a surgical
 * illustration: clean, muted rose-salmon to soft red-brown, lighter and a little less saturated than before (OKLCH
 * lightness 0.52..0.705 instead of 0.385..0.535, chroma 0.066..0.094 instead of 0.08..0.112, hue 17..40 deg; no purple,
 * no tan, no dark blood red). sRGB: #b8746b, #9b6552, #b0676a, #8f584f, #cc8e81, #b98483 (were #913f3b, #7d4230, #7d302b,
 * #673224, #a25251, #915041). Their smallest OKLab distance to each other is 0.040, the same as the previous six, so the
 * neighbour assignment separates touching muscles as well as before (Message 18). Display choices only. */
// R558 (build brief style guide, Message 29: "CL's tones as a base, slightly more saturated for the comic look"): the
// chroma of every tone x MUSCLE_TONE_CHROMA (1.2; lightness and hue unchanged), so the banded comic shading keeps clean,
// clearly coloured tissue instead of greying out. Smallest OKLab distance between two tones 0.040 -> 0.041 (the
// neighbour separation of Message 18 is kept; the lightness steps carry most of it).
export const MUSCLE_TONE_CHROMA = 1.2;
export const MUSCLE_TONES = freeze([
  muscleTone('salmon rose', 0.630, 0.088 * MUSCLE_TONE_CHROMA, 28),
  muscleTone('soft red-brown', 0.560, 0.076 * MUSCLE_TONE_CHROMA, 40),
  muscleTone('muted rose', 0.595, 0.094 * MUSCLE_TONE_CHROMA, 17),
  muscleTone('clay rose', 0.520, 0.074 * MUSCLE_TONE_CHROMA, 30),
  muscleTone('light salmon', 0.705, 0.078 * MUSCLE_TONE_CHROMA, 33),
  muscleTone('dusty rose', 0.665, 0.066 * MUSCLE_TONE_CHROMA, 20)
]);
/** OKLab distance between two tones (0.1 = clearly different, 0.03 = just noticeable side by side). */
export function muscleToneDistance(i, j) {
  const a = MUSCLE_TONES[i], b = MUSCLE_TONES[j];
  if (!a || !b) return 0;
  return Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);
}
// R558 (user Message 22, "clinical and surgical", "not too gruesome and bloody"): the look below is now a clean satin
// anatomy-model finish instead of moist living tissue. Changed (old -> new): deeper storeys less murky (deepShade 0.78
// -> 0.84, intermediateShade 0.9 -> 0.93); satin instead of a wet sheen (roughness 0.5 -> 0.6, sheenGain 0.8 -> 0.55,
// sheen tint near-neutral [1, 0.84, 0.74] -> [1, 0.95, 0.92]); no blood-red scatter in shade (scatterTint [1, 0.42,
// 0.32] -> [1, 0.76, 0.68], scatterStrength 0.22 -> 0.12); softer outline creases (creaseStrength 0.42 -> 0.3, power 2.6
// -> 2.8) so grooves read as clean partings, not dark crevices; finer, fainter fibre streaks like an illustration's
// hatching (fibreAmp 0.1 -> 0.055, fibreBumpM 0.25 -> 0.12 mm); clean pearly tendons, a touch cool and a little
// glossier (0xdcd6cf -> 0xe1e4e7, OKLCH 0.92 0.006 240; tendonMix 0.85 -> 0.9, tendonRoughnessDrop 0.16 -> 0.2).
// The per-muscle tones (Message 18) and the activation glow (Message 17) are kept apart from these: none of these
// terms acts on the glow.
// R558 (user Message 54, "it's very ugly and matte. Maybe we should add a bit of shine, a bit of glossiness"): a
// polished finish instead of the satin one. roughness 0.6 -> 0.42 and sheenGain 0.55 -> 0.85: at 0.6 x 0.55 the
// highlight of a belly under the key light measured about 0.035, UNDER the comic patch's highlight threshold (BODY_CEL
// spec.bellyAt, 0.045 then), so no muscle showed any highlight at all (the matte look of the pictures); now it peaks near 0.2
// and is tighter (the normal within about 11 degrees of the mirror direction). tendonRoughnessDrop 0.2 -> 0.1: a
// tendon part is then at roughness 0.32, glossier than the belly without a pin-point glint.
export const MUSCLE_LOOK = freeze({
  deepShade: 0.84, intermediateShade: 0.93,
  roughness: 0.42,
  tendon: freeze(hexToLinear(0xe1e4e7)), tendonMix: 0.9, tendonRoughnessDrop: 0.1,
  scatterTint: freeze([1.0, 0.76, 0.68]), scatterStrength: 0.12,
  sheenTint: freeze([1.0, 0.95, 0.92]), sheenGain: 0.85,
  creaseStrength: 0.3, creasePower: 2.8, glowCreaseRelief: 1,
  /** Fibre striation: albedo +- fibreAmp and a bump of fibreBumpM metres, streaks about fibreMm wide (source mm) along
   * each muscle's long axis, changing along it over 1 / fibreAlong streak widths; fading out from fibreFadePx streaks
   * per pixel (gone at 2.5 x that), so it never shimmers on a far body. */
  // R558 (Messages 24, 29): the striation is now drawn as ink lines by the comic patch (BODY_CEL); the old soft albedo
  // streaks are off (fibreAmp 0.055 -> 0) and so is their bump (0.12 mm -> 0: it frayed the cel band edges).
  fibreAmp: 0, fibreMm: 2.4, fibreAlong: 0.035, fibreFadePx: 0.3, fibreBumpM: 0,
  /** A glowing muscle's emission x (1 + glowYellowBoost x smoothstep(0.3, 0.8, min(r, g) - b) of its glow colour): a
   * dim yellow reads as olive or brown on a belly in shade (the right-leg yellows did), not as a yellow light; blues,
   * pinks and purples stay dim-safe and are unchanged. */
  glowYellowBoost: 0.4,
  /** assignMuscleTones: neighbours closer than goodDistance in OKLab are penalised by the shortfall x contact weight. */
  goodDistance: 0.075, refinePasses: 12
});

/** R558 (user Messages 25 to 29; the build brief's style guide, Borderlands-style comic rendering of clean, clinical
 * anatomy): the CEL look of the bodies' muscles, tendons and bones (ns-scene-three patchComicShaders). Display
 * choices, all unitless or in the units named.
 *  - bands / soft / levels: the light factor L (lit luminance over albedo luminance; under LIGHT the flat fill alone
 *    gives 0.14 + the sky 0 to 0.32, the key up to 0.8 more: a surface facing the key measures about 1.0 to 1.2, one
 *    turned away 0.15 to 0.35) is drawn in four tones: below bands[0] the deep shadow (levels[0] x albedo: a surface
 *    the key does not reach), then the mid tone (key at a grazing angle), the light tone and the highlight (facing the
 *    key); each step a soft ramp of half-width `soft` in L (wider where L changes by more per pixel, so it is never a
 *    hard pixel step). First try 0.24 / 0.52 / 0.94: almost every surface seen from the eyes fell in the light and
 *    highlight bands (the fill and sky alone reach 0.3 to 0.45), so there was no deep shade at all (Message 27: "deep
 *    deep shades to light light shades"). soft 0.03 cut the bumpy surfaces right in front of the eyes (your own chest)
 *    into ragged light and dark patches ("never splotchy", Message 18): 0.05. boneHigh: the highlight level of bone
 *    and tendon parts (pale ivory and pearly white): at 1.1 the sternum seen from the eyes was a blown-out white patch
 *    that bloomed; 0.9 keeps it the brightest thing on the body without clipping.
 *  - deepTint / deepDesat: the deep band is desaturated by deepDesat toward its own luminance x deepTint (a cool
 *    neutral dark), so shadows on red muscle are never murky brown-red (style guide).
 *  - rim: a crisp rim band where 1 - |N.V| passes `at`, on the side of the camera's rim light (view-space 2D direction
 *    dir: up and to the left, where the LIGHT rim light comes from), adding gain x albedo x colour.
 *  - spec: the highlight SHAPE: the specular luminance through a step at bellyAt on a muscle belly and tendonBoneAt on
 *    a tendon part or a bone (soft half-width), times belly or tendonBone (crisp bright spots on tendon and bone, a
 *    small sheen on muscle).
 *  - gloss (user Message 54): the polished look of the highlight. coreMul: a brighter core where the specular passes
 *    coreMul x the shape's threshold, adding coreBelly on a muscle belly, coreTendonBone on tendon and bone; smooth /
 *    smoothMax: the share of the real, smooth highlight kept round the two crisp steps and the most its luminance may
 *    add (a soft falloff, so the highlight reads as gloss and not as a flat sticker); speckRad: the crisp steps fade
 *    out where the surface normal turns by more than this many radians per pixel (gone at twice that), so a highlight
 *    a pixel or two wide (finger bones, a far figure's bumps) is left out and nothing sparkles.
 *  - Message 49 ("Maybe you've overdone it with the borderlands style?"): the ink inside the forms is lighter than
 *    first drawn: mix fibre 0.3 -> 0.2, hatch 0.85 -> 0.5, stipple 0.32 -> 0.2, tendon 0.28 -> 0.18. The four tones,
 *    the deep shadow and the outline are kept (Messages 26 and 27: the look itself is liked, deep shades stay).
 *  - ink: the style guide's near-black ink (sRGB hex). line: minSpacingPx = lines closer than this fade out (far or
 *    small figures stay clean; full from 1.6 x that), fibrePx / hatchPx = line widths in drawing-buffer pixels;
 *    farFromM / farToM: the ink also fades out with the distance from the camera, from farFromM to farToM metres, so
 *    the mirror body at its start distance stays clean in any window size (first try, the pixel rule alone: at
 *    2560 x 1440 the mirror's trunk was hatched dark all over), while your own body and a mirror body carried near
 *    keep it. Measured at the start (inspect mirror.reflection, first person): the reflection plane is 0.97 m ahead of
 *    the eyes, your own body's foremost point (the toes) 0.99 m from them, the mirror image's nearest parts (its feet
 *    and hands) about 1.2 to 1.3 m, its trunk 1.6 to 1.9 m. Checker fix: the first numbers (1.7 to 2.3 m, from a guessed
 *    mirror distance of 2.5 to 3.5 m) left the mirror's trunk fully inked at 2560 x 1440 and half inked at 1600 x 900
 *    (fine dark hatching over its belly and flanks; most of the dirty look there was the bands, see farSoft); 1.0 to
 *    1.35 m keeps all of your own body inked in first person and the mirror image clean (its hands and feet keep at
 *    most a quarter of the ink, at the coarsest line level). In third person the camera is farther than that, so the
 *    bodies show soft bands without ink there, like any small figure.
 *    mix: opacities of the fibre striation (lit areas of a muscle), the shadow hatching, the bone stipple and the few
 *    long strokes on a tendon. stroke: strokes are about mm long, with soft ends (inShare, outShare of a stroke).
 *    stipple: bone grain cells cellMm, dots above `at` of the noise, fading out under minCellPx per cell.
 *  - spacingMm: the spacing of the ink lines round a muscle and round a bone (hatchFrame).
 */
export const BODY_CEL = freeze({
  bands: freeze([0.42, 0.74, 1.04]), soft: 0.05,
  levels: freeze([0.08, 0.34, 0.78, 1.1]), boneHigh: 0.9,
  // R558 checker (Message 30, "The bone tips probably shouldn't be so spikey"): the deep and mid tones of BONE and of the
  // white TENDON parts. At the muscles' 0.08 / 0.34 every fingertip and toe tip turned away from the head-mounted key
  // light went near-black, so a thin white digit ended in a dark hooked point: the claws and talons of the pictures (own
  // right hand, left game hand, the mirror body's hands). White tissue keeps a light grey shadow instead (sRGB about
  // 0.51 and 0.67 on the ivory bone, below its 0.78 light and 0.84 highlight tones), so a bone end reads as a rounded
  // ivory end; muscles keep their near-black deep band (Message 27).
  boneLevels: freeze([0.3, 0.54]),
  // R558 checker (Message 18 "never splotchy", style guide: the mirror body at its start distance "must stay clean, never
  // dirty"): the half-width of the band steps on a FAR figure (from line.farFromM to line.farToM it widens from `soft`
  // to farSoft). On the mirror body at its start distance (trunk 1.6 to 1.9 m) the light factor of the bumpy lifted
  // belly and flanks wanders around the deep / mid threshold, and the narrow 0.05 step turned that into near-black
  // streaks and blotches all over its trunk: the dirty look, measured with the ink switched off (it was the bands, not
  // the ink). 0.16 keeps the tonal steps there but as soft shading; your own body (within 0.99 m) keeps the crisp bands.
  farSoft: 0.16,
  deepTint: freeze([0.9, 0.95, 1.07]), deepDesat: 0.55,
  rim: freeze({ at: 0.55, gain: 1.0, colour: freeze([0.8, 0.9, 1.0]), dir: freeze([-0.45, 0.89]) }),
  // spec: GGX peaks under the key measured from the materials: muscle belly (roughness 0.6) about 0.06, tendon part
  // (0.4) about 0.3, bone (boneRoughness 0.5) about 0.13. A first try (one step at 0.05, gain 1.25 on bone) turned
  // every bone face toward the headlight into a white patch that bloomed (the pelvis seen from the eyes).
  spec: freeze({ bellyAt: 0.05, tendonBoneAt: 0.1, soft: 0.012, belly: 0.14, tendonBone: 0.26 }),
  gloss: freeze({ coreMul: 2.4, coreBelly: 0.24, coreTendonBone: 0.26, smooth: 0.55, smoothMax: 0.3, speckRad: 0.1 }),
  ink: 0x0b0809,
  line: freeze({ minSpacingPx: 4.5, fibrePx: 0.55, hatchPx: 0.8, farFromM: 1.0, farToM: 1.35 }),
  mix: freeze({ fibre: 0.2, hatch: 0.5, stipple: 0.2, tendon: 0.18 }),
  stroke: freeze({ mm: 22, inShare: 0.1, outShare: 0.16 }),
  stipple: freeze({ cellMm: 2.0, at: 0.8, minCellPx: 1.8 }),
  spacingMm: freeze({ muscle: 3.2, bone: 3.0 })
});

/** Side-free key of a muscle for its tone, so the left and the right muscle of a pair share one tone: the catalogue
 * source name with the words right / left and a side suffix removed (e.g. 'Acromial part of right deltoid' -> 'acromial
 * part of deltoid', 'Frontalis muscle.r' -> 'frontalis muscle'), else the element id without the left-side 'M' suffix (FJ1442M -> FJ1442) or the face packet's side suffix
 * (zf-buccinator-l -> zf-buccinator), else the id itself. */
export function muscleToneKey(id, sourceName = null) {
  if (typeof sourceName === 'string' && sourceName.trim()) {
    // The face packet's source names carry the side as a suffix ('Frontalis muscle.r' / 'Frontalis muscle.l'): drop it too,
    // or the two sides of a face muscle get different tones (Message 15).
    const k = sourceName.toLowerCase().replace(/\b(right|left)\b/g, ' ').replace(/[._\s-][rl]\s*$/, '').replace(/\s+/g, ' ').trim();
    if (k) return k;
  }
  const s = typeof id === 'string' ? id : String(id);
  return /^FJ\d+M$/.test(s) ? s.slice(0, -1) : /^zf-.+-[lr]$/.test(s) ? s.slice(0, -2) : s;
}
const toneHash = key => { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** Tone of a key with no neighbours known (a stable hash). */
export function muscleToneFallback(key) { return toneHash(String(key)) % MUSCLE_TONES.length; }

/** Neighbour-aware tones (pure, deterministic). keys: side-free muscle keys; contacts: Map key -> Map(neighbourKey ->
 * contact weight > 0) (symmetric; self contacts ignored). Greedy: the most-connected muscle first (ties by key); each
 * takes the tone with the smallest penalty sum over its already-toned neighbours of weight x max(0, goodDistance -
 * distance), ties broken by a stable per-key rotation so equal cases do not all fall on tone 0. Returns Map key -> tone
 * index; also { worst } = the smallest tone distance over all contacts (weight-sorted report in .pairs). */
export function assignMuscleTones(keys, contacts, look = MUSCLE_LOOK) {
  const list = [...new Set(keys)].map(String);
  const nb = k => (contacts && contacts.get(k)) || new Map();
  const deg = new Map(list.map(k => { let s = 0; for (const [n, w] of nb(k)) if (n !== k) s += w; return [k, s]; }));
  list.sort((a, b) => deg.get(b) - deg.get(a) || (a < b ? -1 : a > b ? 1 : 0));
  const tone = new Map(), N = MUSCLE_TONES.length;
  for (const k of list) {
    let best = -1, bestCost = Infinity;
    const rot = toneHash(k) % N;
    for (let r = 0; r < N; r++) {
      const t = (rot + r) % N;
      let cost = 0;
      for (const [n, w] of nb(k)) {
        if (n === k || !tone.has(n)) continue;
        cost += Math.sqrt(w) * Math.max(0, look.goodDistance - muscleToneDistance(t, tone.get(n))) ** 2;
      }
      if (cost < bestCost - 1e-12) { bestCost = cost; best = t; }
    }
    tone.set(k, best < 0 ? rot : best);
  }
  // Refinement: each muscle in turn re-picks its tone against ALL its neighbours (not only those toned before it),
  // keeping a change only when it lowers its penalty; repeated until nothing changes (at most refinePasses passes).
  const costOf = (k, t) => { let c = 0; for (const [n, w] of nb(k)) if (n !== k && tone.has(n)) c += Math.sqrt(w) * Math.max(0, look.goodDistance - muscleToneDistance(t, tone.get(n))) ** 2; return c; };
  for (let pass = 0; pass < (look.refinePasses || 0); pass++) {
    let changed = 0;
    for (const k of list) {
      const cur = tone.get(k);
      let best = cur, bestCost = costOf(k, cur);
      for (let t = 0; t < N; t++) { if (t === cur) continue; const c = costOf(k, t); if (c < bestCost - 1e-9) { bestCost = c; best = t; } }
      if (best !== cur) { tone.set(k, best); changed++; }
    }
    if (!changed) break;
  }
  return tone;
}

/** Resting base colour (LINEAR RGB) of a muscle: its tone darkened by its storey ('deep' x deepShade, 'intermediate' x
 * intermediateShade; 'outer' and anything else x 1). `out` reused. */
export function muscleBaseInto(toneIndex, level, out = [0, 0, 0], look = MUSCLE_LOOK) {
  const t = MUSCLE_TONES[Number.isInteger(toneIndex) && toneIndex >= 0 && toneIndex < MUSCLE_TONES.length ? toneIndex : 0].linear;
  const k = level === 'deep' ? look.deepShade : level === 'intermediate' ? look.intermediateShade : 1;
  for (let i = 0; i < 3; i++) out[i] = t[i] * k;
  return out;
}

/** Emission scale of a glowing muscle for a glow colour (LINEAR RGB): 1 for most hues, up to 1 + glowYellowBoost for a
 * yellow (see MUSCLE_LOOK.glowYellowBoost). */
export function muscleGlowGainScale(glowLinear, look = MUSCLE_LOOK) {
  if (!glowLinear || glowLinear.length !== 3) return 1;
  const y = Math.min(glowLinear[0], glowLinear[1]) - glowLinear[2];
  return 1 + look.glowYellowBoost * smoothstep(0.3, 0.8, y);
}

// R558 (user Message 20, builder FA): the eyes of the completed head (BodyParts3D sclera, iris and lens; packet
// bodyparts3d-head-r1). An anatomy-atlas eye: a soft warm white sclera with a faint sheen (not paper white, so it never
// glares next to the ivory bone), a muted brown iris and a near-black lens that reads as the pupil through the iris
// opening. Display colours, not a measured eye. sRGB hex and roughness per part.
export const EYE_LOOK = freeze({
  sclera: freeze({ hex: 0xe4ddd2, roughness: 0.32 }),
  iris: freeze({ hex: 0x5e4433, roughness: 0.5 }),
  lens: freeze({ hex: 0x0c0a0a, roughness: 0.22 })
});
/** The eye part of a body entry ('sclera' | 'iris' | 'lens'), or null: tissue 'eye' and the part's name. */
export function eyePartOf(entry) {
  if (!entry || entry.tissue !== 'eye') return null;
  const s = `${entry.requested_structure || entry.name || entry.embedded_source_name || ''}`.toLowerCase();
  return /sclera/.test(s) ? 'sclera' : /iris/.test(s) ? 'iris' : /lens/.test(s) ? 'lens' : null;
}

// R558 (user Message 20: "The arm and face muscles look the most wrong and disgusting"; builder FA, surface exceptions
// where the face muscles' GEOMETRY needs them; their colours stay the body's, which builder CL owns): the face muscles
// (the Z-Anatomy face packet, element ids zf-...) are thin sheets of 1-3 mm over bone that insert into skin.
//  tendonScale: the stack's tendon estimate (anchored x thin x end of the long axis) is read from the head fill of at
//    most 0.5 mm, which says nothing about where a muscle that inserts into skin turns tendinous: it laid white
//    blotches on buccinator (27 % of its vertices over 0.3), risorius (25 %), orbicularis oris (21 %) and depressor
//    labii inferioris (17 %). Only masseter and temporalis, which do have tendinous parts, keep some of it;
//  noFibre: the lengthwise streaks follow each mesh's principal axis, which is wrong on the ring muscles (orbicularis
//    oculi, orbicularis oris), whose fibres run round the eye and the mouth: none there.
// Display choices, not measured anatomy.
export const FACE_MUSCLE_LOOK = freeze({
  tendonScale: 0, tendonKeep: freeze([freeze({ match: /masseter|temporalis/, scale: 0.6 })]),
  noFibre: /orbicularis/
});
/** True for a face-packet muscle id (zf-...). */
export function isFaceMuscleId(id) { return typeof id === 'string' && /^zf-/.test(id); }
/** Scale of the stack's tendon estimate for a muscle id (1 for every body and arm muscle; FACE_MUSCLE_LOOK for the face). */
export function muscleTendonScale(id, look = FACE_MUSCLE_LOOK) {
  if (!isFaceMuscleId(id)) return 1;
  for (const r of look.tendonKeep) if (r.match.test(id)) return r.scale;
  return look.tendonScale;
}
/** 0 where lengthwise fibre streaks would run the wrong way (the face's ring muscles), else 1. */
export function muscleFibreScale(id, look = FACE_MUSCLE_LOOK) { return isFaceMuscleId(id) && look.noFibre.test(id) ? 0 : 1; }

// ---------------------------------------------------------------------------------------------
// R558 (user Message 53: "instead of making it a glowing power up, level up, let's make it more of a neon fluorescent
// flash"; Message 17: "clear fluorescent glow correspondence across all 3 systems during activation"): the NEON FLASH.
// When an area switches on, the area on the brain and the muscles it drives on your body and on the mirror body run the
// SAME short sequence in the area's colour, from one shared start time, like a neon tube being switched on:
//   1 strike (strikeS): the whole muscle / area comes on at once (no front runs along it) and rises straight to the
//     flash peak; the surface colour goes from the resting tissue colour (strikeAlbedo of the glow tint) to the tint;
//   2 flash: at the peak the glow is 1 + flashGain times the settled glow, with a white-hot core (flashWhite; on a
//     brain area scaled by areaWhiteScale so the area keeps its own hue) and the muscle's halo shell flaring by
//     haloBurst of its width; it settles exponentially (flashTau);
//   3 steady glow: while the activity holds the glow is steady, like a lit tube (no pulse, no ripple);
//   4 fade: the glow then follows the activity down (the activity's own fade; ns-actions DISPLAY_ENVELOPE).
// It replaces the power-up charge of Message 22 (a 0.26 s energy front, a burst, a breathing pulse and running
// ripples), which read as a game's level-up rather than as an area switching on, and it answers at once: the glow is
// at full strength strikeS after the activation instead of 0.26 s after it.
// One flash per activation, never a flicker: with rechargeS an area flashes at most about 1.7 times a second (below 3
// a second). A glow that comes back within rearmS of going dark (the turns of the Space dance) stays steady, no new
// flash. The STRENGTH scales with the activity (glowIntensity), so stronger activity is brighter. Opposing-action hints
// are CALM (no flash: Messages 6 and 17, "faint"). Under prefers-reduced-motion there is no flash: one calm ramp to the
// steady glow over reducedRampS.
// powerUpEnvelope is the CPU record of the rule; powerUpGlsl emits the identical function for the shaders. (The names
// keep "powerUp" so the shader interface is unchanged.) Timings are UI choices, not physiology.
export const POWER_UP = freeze({
  strikeS: 0.045, strikeAlbedo: 0.2,
  flashTau: 0.14, flashGain: 1.5, flashWhite: 0.36, haloBurst: 0.6,
  reducedRampS: 0.3,
  /** An area (and its muscles) that lights again within rearmS seconds of going dark carries on its steady glow
   * instead of flashing again: the Space dance's levels follow each stroke's speed (a half cosine), so every limb goes
   * dark for about 0.33 s at each turn of the slow dance (0.04 s in the fast one); without this every stroke of every
   * limb would flash. A new look or click after a 1 s pulse has ended (dark longer than this) flashes. */
  rearmS: 0.4,
  /** A new deliberate activation (a click, a muscle tap, a look held for ns-actions GAZE_DWELL.markS: one more count in
   * activatedRegions) of an area that is STILL glowing flashes it again, area and muscles together, so a second click
   * is seen; not sooner than rechargeS after its last start (longer than markS 0.5 s, so the held look that lit the
   * area does not flash it twice, and at most about 1.7 flashes a second per area, below 3 a second). */
  rechargeS: 0.6,
  /** A glow that shows a HELD POSTURE rather than an activation (the neck and trunk areas while the mouse look turns the
   * head, ns-app headActivity) starts already settled: its start is dated settledAgeS in the past, so it shows the
   * steady glow at once, with no flash. The head is turned almost all the time, so a flash at every new turn of the
   * head was a stream of small flashes on the neck. A click or a held look on such an area still flashes it
   * (rechargeS). */
  settledAgeS: 1.2,
  /** On a brain AREA the whitening of the flash is scaled by this: an area's emission is about 4.5 times a muscle's
   * (AREA_LOOK areaGain 1.35 against muscleGain 0.3) and already at full brightness, so the full whitening turned the
   * flashing area near-white and its own hue was lost (measured in the browser: the lit left elbow area went from sRGB
   * 127, 235, 235 settled to 232, 233, 234 at the peak). */
  areaWhiteScale: 0.35
});
/** Flash amount 0..1 of the neon flash at ageS seconds after the activation started (0 when calm or reduced): a
 * straight rise over strikeS, then an exponential settle (flashTau). */
export function powerUpFlash(ageS, { calm = false, reduced = false } = {}, p = POWER_UP) {
  if (calm || reduced) return 0;
  const a = Number.isFinite(ageS) ? Math.max(0, ageS) : 1e3;
  return a < p.strikeS ? a / p.strikeS : Math.exp(-(a - p.strikeS) / p.flashTau);
}
/** Neon-flash envelope at ageS seconds after the activation started: { gain (x the settled glow emission), white (0..1
 * toward white of the same brightness), sat (colour saturation, always 1), albedo (0..1: share of the glow-tinted
 * surface colour, the rest the resting tissue colour), flash (0..1) }. `u` (the place along the muscle or across the
 * area's band) is not used: the whole muscle / area lights at once; the argument stays so the callers and the shaders
 * keep one interface. calm: an opposing-action hint (always the settled glow); reduced: prefers-reduced-motion (a calm
 * ramp). Pure. */
export function powerUpEnvelope(ageS, u = 0.5, { calm = false, reduced = false } = {}, p = POWER_UP) {
  if (calm) return { gain: 1, white: 0, sat: 1, albedo: 1, flash: 0 };
  const a = Number.isFinite(ageS) ? Math.max(0, ageS) : 1e3;
  if (reduced) { const r = smoothstep(0, p.reducedRampS, a); return { gain: r, white: 0, sat: 1, albedo: r, flash: 0 }; }
  const flash = powerUpFlash(a, {}, p);
  const on = a < p.strikeS ? a / p.strikeS : 1;
  return { gain: on * (1 + p.flashGain * flash), white: p.flashWhite * flash, sat: 1, albedo: p.strikeAlbedo + (1 - p.strikeAlbedo) * on, flash };
}
/** GLSL of the neon flash: `vec4 <name>( float age, float u, float calm, float reduced )` -> (gain, white, sat, albedo),
 * the same rule as powerUpEnvelope, and `float <name>Flash( float age, float calm, float reduced )` (powerUpFlash). */
export function powerUpGlsl(name = 'nsPowerUp', p = POWER_UP) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('ns:colors_glsl: name must be a GLSL identifier');
  const f = glslFloat;
  return [
    `float ${name}Flash( float age, float calm, float reduced ) { if ( calm > 0.5 || reduced > 0.5 ) return 0.0; float a = max( age, 0.0 ); return a < ${f(p.strikeS)} ? a / ${f(p.strikeS)} : exp( -( a - ${f(p.strikeS)} ) / ${f(p.flashTau)} ); }`,
    `vec4 ${name}( float age, float u, float calm, float reduced ) {`,
    '  if ( calm > 0.5 ) return vec4( 1.0, 0.0, 1.0, 1.0 );',
    '  float a = max( age, 0.0 );',
    `  if ( reduced > 0.5 ) { float r = smoothstep( 0.0, ${f(p.reducedRampS)}, a ); return vec4( r, 0.0, 1.0, r ); }`,
    `  float flash = ${name}Flash( a, 0.0, 0.0 );`,
    `  float on = a < ${f(p.strikeS)} ? a / ${f(p.strikeS)} : 1.0;`,
    `  return vec4( on * ( 1.0 + ${f(p.flashGain)} * flash ), ${f(p.flashWhite)} * flash, 1.0, ${f(p.strikeAlbedo)} + ${f(1 - p.strikeAlbedo)} * on );`,
    '}'
  ].join('\n');
}
