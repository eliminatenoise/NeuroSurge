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
