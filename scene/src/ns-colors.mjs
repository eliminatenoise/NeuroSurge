/** NeuroSurge shared simulated-activity colour ramp (round 2, owner U2a-brain) and, since round 4 (R4-access, D9), the
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
  otherTint: freeze([0.345, 0.300, 0.232]),
  /** The darker alternate grey (odd strip order), same ratio as before. Round 3: [0.27, 0.27, 0.37]. */
  otherTintAlt: freeze([0.283, 0.246, 0.190]),
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
//    The mirror arrows are also smaller (ns-arrows3d ARROW_SIZES) and sit around the mirror body: never colour alone.
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
  regionBacking: freeze({ color: 0x05070b, alpha: 0.85 }),
  accent: 0x53b27f
});
