/** NeuroSurge scene: the comic ink look of the brain (R558 BB; user Messages 24, 25, 26, 27, 28, 29 and the style guide).
 *
 * Message 24: "Let's introduce texture to all our tissues (especially gyri and sulci for the motor neural tissue)."
 * Message 29: "Perhaps the borderlands aesthetic should be applied throughout."
 *
 * What is here (pure: strings, numbers and typed arrays; nothing imports 'three'):
 *  - FOLDS FROM THE ATLAS'S OWN GEOMETRY (foldDepth). The motor areas are drawn on the atlas's own precentral gyrus
 *    (BodyParts3D FJ1801 / FJ1800, OBJ99, about 2.7 mm edges). Each strip mesh is a CLOSED gyral volume: its outer
 *    surface is the crown and the two banks that dive into the central sulcus (behind) and the precentral sulcus (in
 *    front); its inner faces are cut surfaces against the neighbouring gyri and the white matter. Nothing on the strip
 *    mesh alone says where the sulci are, but the neighbouring gyri do: the postcentral gyrus, the frontal gyri and the
 *    rest of the 59 atlas brain meshes. For every strip vertex the fold depth is how far the vertex lies BELOW a ball of
 *    radius ballMm rolled over the whole atlas brain from outside, approximated locally: the largest
 *    h - lateral^2 / (2 ballMm) over every atlas brain vertex within radiusMm (h = its height above the vertex along the
 *    vertex's smoothed outward normal, lateral = its distance from that normal line). A gyral crown has nothing above it
 *    (0 mm); a bank or a sulcal floor has the opposite gyrus's crown above it and gets that depth (several mm); the cut
 *    faces inside the brain are deepest. Only atlas vertices are read; nothing is invented, and no fold is added that is
 *    not in the atlas geometry. foldShade maps the depth to 0 (crown) .. 1 (floor) for the shader. Load cost: about
 *    55 ms per strip mesh (measured in Node, 178,743 atlas brain vertices).
 *  - The motor-area SHADER PATCH (patchAreaInkShaders), on top of the per-fragment areas (ns-scene-three REGION_BORDER):
 *      cel bands: the direct light's N.L is quantised into BRAIN_INK.cel's four tones with narrow soft steps (never a hard
 *        pixel step: each step is at least one pixel wide);
 *      folds: the floors darken (ns-scene-three REGION_BORDER.cavity x foldShade, unchanged rule, new data) and an ink
 *        line runs ALONG each sulcus (the level line foldShade = sulcusLevel, constant width in CSS pixels);
 *      contour: an ink line where the strip turns away from the eye (N.V = 0 with the smooth strip normals): the
 *        outline of the gyrus and of the hand knob, object-anchored, anti-aliased by its own screen gradient;
 *      hatching: fine ink strokes ACROSS the gyrus (level lines of the along-gyrus coordinate s, so they are fixed to the
 *        tissue and never swim) inside the shadow bands and on the deep banks, a second offset set where darker, faded
 *        out when the strokes would be closer than hatchMinSpacingCss on screen (far or small brains) and under a glow.
 *    The area colours, the per-fragment bands, the borders, the picking and the place of the strip are not touched; the
 *    power-up charge (emission) is never inked over, only the strokes fade under it.
 *  - The GLASS ink (glassInkGlsl): an ink line at the glass's own contours (N.V = 0 of the nearest glass surface: every
 *    gyrus outlined where it turns away), a thin light rim just inside it so the glass still reads on the space-black
 *    background, and one crisp highlight shape per crown from the key light.
 *
 * Display only: every number below is a display choice; none is a measurement of tissue or of neural activity.
 */

/** Display choices (see the BB report for what was tried).
 *  ink: near-black #0b0809 as drawn (sRGB), the style guide's ink, shared with ns-outline OUTLINE.colour.
 *  fold: foldDepth radiusMm / ballMm; foldShade loMm (crown up to here) .. hiMm (floor from here).
 *  cel: N.L steps (t1 < t2 < t3), the four tone levels (deep shadow, mid, light, highlight) and the soft half-width of a
 *    step in N.L units (widened to at least one pixel by the step's screen gradient).
 *  area: contourCss / contourAlpha: half-width (CSS px) and opacity of the gyrus contour; sulcusLevel / sulcusCss /
 *    sulcusAlpha: the foldShade level of the sulcus line (low on the bank, near the floor), its half-width and opacity;
 *    floorDark / floorFrom / floorTo: the lit light (not the activation glow) is darkened by up to floorDark from fold
 *    floorFrom to floorTo, on top of the albedo cavity rule, so the floors go deep while the crowns stay lit; indirect:
 *    the share of the flat fill (ambient and sky light) the areas keep, so the banded key light shapes the gyrus (deep
 *    shadow to lit crown, Message 25) instead of an even fill; hatchPerS: strokes per unit of the
 *    along-gyrus coordinate s (about 1 mm apart at the strip's middle); hatchCss: stroke half-width; hatchAlpha: stroke
 *    opacity; hatchFrom / hatchFull: shade (0 dark .. 1 lit, the luminance-weighted banded N.L of the direct lights) at
 *    which the strokes start / are full; denseFrom / denseFull: the same for the second, offset set; foldHatch: the fold
 *    depth share that also counts as shadow; hatchMinSpacingCss: strokes closer than this on screen fade out; glowFade:
 *    emission luminance over which the strokes and the sulcus line fade (the power-up stays clean).
 *  glass: contourCss / contourAlpha: the glass contour ink; rimCss / rimLight / rimAlpha: the light band just inside it;
 *    highlight: power of the key-light highlight, its crisp step (lo .. hi), added light and alpha (a highlight whose
 *    step is crossed within about a pixel, a speck on the coarse mesh, is left out); lightDir: the view-space
 *    key light of the glass (ns-scene-three GLASS_READ.lightDir). */
export const BRAIN_INK = Object.freeze({
  ink: Object.freeze([0x0b / 255, 0x08 / 255, 0x09 / 255]),
  fold: Object.freeze({ radiusMm: 14, ballMm: 10, loMm: 1.0, hiMm: 10 }),
  cel: Object.freeze({ steps: Object.freeze([0.12, 0.4, 0.74]), levels: Object.freeze([0.1, 0.42, 0.74, 1.0]), soft: 0.035 }),
  area: Object.freeze({
    contourCss: 1.05, contourAlpha: 0.92,
    sulcusLevel: 0.8, sulcusCss: 0.85, sulcusAlpha: 0.9, floorDark: 0.5, floorFrom: 0.2, floorTo: 1.0, indirect: 0.6,
    hatchPerS: 150, hatchCss: 0.42, hatchAlpha: 0.42, hatchFrom: 0.36, hatchFull: 0.12, denseFrom: 0.16, denseFull: 0.04,
    foldHatch: 0.45, hatchMinSpacingCss: 4, glowFade: Object.freeze([0.04, 0.32])
  }),
  glass: Object.freeze({
    contourCss: 0.75, contourAlpha: 0.7, rimCss: 1.4, rimLight: 0.3, rimAlpha: 0.12,
    highlight: Object.freeze({ power: 400, lo: 0.86, hi: 0.9, light: 0.6, alpha: 0.18 })
  })
});

/** sRGB 0..1 -> linear (the shaders mix in linear light). Pure. */
export function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

/** Fold depth (source mm) of each vertex of `positions` under the rolled ball over `cloud` (pure; see the header).
 * positions, normals: xyz per vertex (normals unit, outward); cloud: xyz of every atlas brain vertex (source mm).
 * Uniform grid of cell radiusMm; cost about linear in vertices x neighbours. Returns Float32Array(vertexCount). */
export function foldDepth(positions, normals, cloud, { radiusMm = BRAIN_INK.fold.radiusMm, ballMm = BRAIN_INK.fold.ballMm } = {}) {
  const n = positions.length / 3, out = new Float32Array(n);
  if (!cloud || cloud.length < 3 || !normals || normals.length !== positions.length || !(radiusMm > 0) || !(ballMm > 0)) return out;
  // integer cell keys (exact for cells within +-512 of the origin: +-7 m at the radius used; source mm are within 2 m)
  const cell = radiusMm, grid = new Map(), key = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
  for (let p = 0; p + 2 < cloud.length; p += 3) {
    const kk = key(Math.floor(cloud[p] / cell), Math.floor(cloud[p + 1] / cell), Math.floor(cloud[p + 2] / cell));
    let l = grid.get(kk);
    if (!l) { l = []; grid.set(kk, l); }
    l.push(p);
  }
  const R2 = radiusMm * radiusMm, k2 = 1 / (2 * ballMm);
  for (let v = 0; v < n; v++) {
    const x = positions[3 * v], y = positions[3 * v + 1], z = positions[3 * v + 2];
    const nx = normals[3 * v], ny = normals[3 * v + 1], nz = normals[3 * v + 2];
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell), ck = Math.floor(z / cell);
    let best = 0;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let k = ck - 1; k <= ck + 1; k++) {
      const l = grid.get(key(i, j, k));
      if (!l) continue;
      for (const p of l) {
        const dx = cloud[p] - x, dy = cloud[p + 1] - y, dz = cloud[p + 2] - z;
        const h = dx * nx + dy * ny + dz * nz;
        if (h <= best) continue;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R2) continue;
        const cap = h - (d2 - h * h) * k2;
        if (cap > best) best = cap;
      }
    }
    out[v] = best;
  }
  return out;
}

/** Fold depth (mm) -> 0 crown .. 1 floor (smoothstep loMm .. hiMm). Pure. */
export function foldShade(depthMm, { loMm = BRAIN_INK.fold.loMm, hiMm = BRAIN_INK.fold.hiMm } = {}) {
  const out = new Float32Array(depthMm.length);
  for (let i = 0; i < depthMm.length; i++) {
    const t = Math.min(1, Math.max(0, (depthMm[i] - loMm) / (hiMm - loMm)));
    out[i] = t * t * (3 - 2 * t);
  }
  return out;
}

const glslFloat = x => (Number.isInteger(x) ? `${x}.0` : `${x}`);
/** GLSL of one anti-aliased ink line (R558 BB check): coverage at a distance d (drawing-buffer px) from the line's middle
 * for a half-width w (px). A line thinner than INK_MIN_HALF_PX keeps that half-width and fades by w / INK_MIN_HALF_PX
 * instead, so a hair line (the sulcus line, the strokes and the contours at Low quality, where w is a third of a pixel)
 * stays one even, faint line instead of breaking into dots where pixel centres miss it. */
export const INK_MIN_HALF_PX = 0.75;
const INK_LINE_GLSL = `float nsInkLine( float d, float w ) {
	float ww = max( w, ${glslFloat(INK_MIN_HALF_PX)} );
	return ( 1.0 - smoothstep( ww - 0.6, ww + 0.6, d ) ) * clamp( w / ${glslFloat(INK_MIN_HALF_PX)}, 0.0, 1.0 );
}
`;
const AREA_LIGHT_LINE = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const AREA_LIGHTS_INCLUDE = '#include <lights_physical_pars_fragment>';
const AREA_OPAQUE_HOOK = '#include <opaque_fragment>';
const AREA_LIGHTS_END = '#include <lights_fragment_end>';

/** GLSL of the four-tone band (uniforms nsCelS = steps + soft, nsCelL = levels). */
const CEL_GLSL = `
float nsDirect = 0.0;
float nsDirectW = 0.0;
float nsCelBand( float x ) {
	float s = max( nsCelS.w, 0.75 * fwidth( x ) );
	float b = mix( nsCelL.x, nsCelL.y, smoothstep( nsCelS.x - s, nsCelS.x + s, x ) );
	b = mix( b, nsCelL.z, smoothstep( nsCelS.y - s, nsCelS.y + s, x ) );
	return mix( b, nsCelL.w, smoothstep( nsCelS.z - s, nsCelS.z + s, x ) );
}
`;

/**
 * Motor-area ink patch (pure). Needs the per-fragment area patch first (its varyings vNsS, vNsCav and its uniform
 * nsLineW, whose w is the pixel ratio). lightsChunk: THREE.ShaderChunk.lights_physical_pars_fragment (for the cel bands;
 * without it, or when its N.L line is not found, the areas are drawn without bands and `cel` is false).
 * Uniforms: nsInkC (ink rgb linear), nsCelS, nsCelL, nsAInk (contour half-width CSS, contour alpha, sulcus level, sulcus
 * half-width CSS), nsAInk2 (sulcus alpha, strokes per s, stroke half-width CSS, stroke alpha), nsAHatch (hatchFrom,
 * hatchFull, denseFrom, denseFull), nsAHatch2 (foldHatch, min spacing CSS, glow fade lo, hi), nsAFold (floorDark,
 * floorFrom, floorTo, -).
 * Returns { vertexShader, fragmentShader, cel } or null when a hook is missing.
 */
export function patchAreaInkShaders(vertexShader, fragmentShader, lightsChunk = null) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  if (!fragmentShader.includes(AREA_OPAQUE_HOOK) || !fragmentShader.includes('varying float vNsCav') || !fragmentShader.includes('varying float vNsS') ||
    !fragmentShader.includes('uniform vec4 nsLineW') || !fragmentShader.includes('vViewPosition')) return null;
  let fs = fragmentShader;
  let cel = false;
  if (typeof lightsChunk === 'string' && lightsChunk.includes(AREA_LIGHT_LINE) && fs.includes(AREA_LIGHTS_INCLUDE)) {
    const banded = lightsChunk.replace(AREA_LIGHT_LINE,
      'float dotNL = nsCelBand( saturate( dot( geometryNormal, directLight.direction ) ) );\n' +
      '\t{ float nsLum = dot( directLight.color, vec3( 0.2126, 0.7152, 0.0722 ) ); nsDirect += dotNL * nsLum; nsDirectW += nsLum; }');
    fs = fs.replace(AREA_LIGHTS_INCLUDE, CEL_GLSL + banded);
    cel = true;
  } else {
    fs = fs.replace(AREA_OPAQUE_HOOK, AREA_OPAQUE_HOOK); // no bands: nsDirect stays 0 below and the shade reads as lit
  }
  const head = INK_LINE_GLSL + 'uniform vec4 nsInkC;\nuniform vec4 nsCelS;\nuniform vec4 nsCelL;\nuniform vec4 nsAInk;\nuniform vec4 nsAInk2;\nuniform vec4 nsAHatch;\nuniform vec4 nsAHatch2;\nuniform vec4 nsAFold;\n' +
    (cel ? '' : 'float nsDirect = 1.0;\nfloat nsDirectW = 1.0;\n');
  const body = `
	{
		float nsPrI = max( nsLineW.w, 0.25 );
		// the gyrus contour: N.V = 0 of the smooth strip normals, a constant width on the screen
		float nsFace = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
		float nsFaceG = max( length( vec2( dFdx( nsFace ), dFdy( nsFace ) ) ), 1e-5 );
		float nsCw = nsAInk.x * nsPrI;
		float nsCont = nsInkLine( nsFace / nsFaceG, nsCw );
		// the sulcus line: the level line of the fold depth
		float nsF = clamp( vNsCav, 0.0, 1.0 );
		float nsFg = max( length( vec2( dFdx( nsF ), dFdy( nsF ) ) ), 1e-6 );
		float nsSw = nsAInk.w * nsPrI;
		float nsSul = nsInkLine( abs( nsF - nsAInk.z ) / nsFg, nsSw );
		// hatching across the gyrus (level lines of the along-gyrus coordinate s) in the shadow and on the deep banks
		float nsShade = nsDirectW > 0.0 ? nsDirect / nsDirectW : 1.0;
		float nsHf = vNsS * nsAInk2.y;
		float nsHg = max( length( vec2( dFdx( nsHf ), dFdy( nsHf ) ) ), 1e-6 );
		float nsMin = nsAHatch2.y * nsPrI;
		float nsVis = smoothstep( nsMin, 1.6 * nsMin, 1.0 / nsHg );
		float nsHw = nsAInk2.z * nsPrI;
		float nsH1 = nsInkLine( abs( fract( nsHf + 0.5 ) - 0.5 ) / nsHg, nsHw );
		float nsH2 = nsInkLine( abs( fract( nsHf ) - 0.5 ) / nsHg, nsHw );
		float nsDark = max( 1.0 - smoothstep( nsAHatch.y, nsAHatch.x, nsShade ), nsAHatch2.x * smoothstep( 0.6, 0.98, nsF ) );
		float nsDense = 1.0 - smoothstep( nsAHatch.w, nsAHatch.z, nsShade );
		float nsGlowK = 1.0 - smoothstep( nsAHatch2.z, nsAHatch2.w, dot( totalEmissiveRadiance, vec3( 0.2126, 0.7152, 0.0722 ) ) );
		float nsHat = max( nsH1 * nsDark, nsH2 * nsDense ) * nsVis * nsAInk2.w * nsGlowK;
		// dark sulcal floors: the lit light falls off down the bank; the glow is kept (only a faint resting self-light,
		// under nsGlowK, falls off with it)
		float nsFloor = 1.0 - nsAFold.x * smoothstep( nsAFold.y, nsAFold.z, nsF );
		// the reflected light kept at most white (R558 BB check): at the strip's grazing silhouette the specular term
		// spikes on single pixels, which the HDR target (bloom) turned into white sparkles along the strip's edge; only
		// the glow (emission) may go above white and bloom (style guide: selective bloom)
		vec3 nsRefl = min( outgoingLight - totalEmissiveRadiance, vec3( 1.0 ) );
		outgoingLight = totalEmissiveRadiance * mix( 1.0, nsFloor, nsGlowK ) + nsRefl * nsFloor;
		float nsLine = max( nsCont * nsAInk.y, nsSul * nsAInk2.x * nsGlowK );
		float nsInkA = max( nsLine, nsHat );
		outgoingLight = mix( outgoingLight, nsInkC.rgb, nsInkA );
		diffuseColor.a = max( diffuseColor.a, nsLine * 0.9 );
	}
`;
  fs = head + fs.replace(AREA_OPAQUE_HOOK, body + AREA_OPAQUE_HOOK);
  if (fs.includes(AREA_LIGHTS_END)) fs = fs.replace(AREA_LIGHTS_END, `${AREA_LIGHTS_END}\n\treflectedLight.indirectDiffuse *= nsAFold.w;`);
  return { vertexShader, fragmentShader: fs, cel };
}

/** Uniform values (plain arrays) of the motor-area ink patch for BRAIN_INK. Pure. */
export function areaInkUniformValues(o = BRAIN_INK) {
  const a = o.area;
  return {
    nsInkC: [srgbToLinear(o.ink[0]), srgbToLinear(o.ink[1]), srgbToLinear(o.ink[2]), 1],
    nsCelS: [o.cel.steps[0], o.cel.steps[1], o.cel.steps[2], o.cel.soft],
    nsCelL: [o.cel.levels[0], o.cel.levels[1], o.cel.levels[2], o.cel.levels[3]],
    nsAInk: [a.contourCss, a.contourAlpha, a.sulcusLevel, a.sulcusCss],
    nsAInk2: [a.sulcusAlpha, a.hatchPerS, a.hatchCss, a.hatchAlpha],
    nsAHatch: [a.hatchFrom, a.hatchFull, a.denseFrom, a.denseFull],
    nsAHatch2: [a.foldHatch, a.hatchMinSpacingCss, a.glowFade[0], a.glowFade[1]],
    nsAFold: [a.floorDark, a.floorFrom, a.floorTo, a.indirect]
  };
}

/** GLSL appended to the glass read patch (ns-scene-three glassReadGlsl; nsN, nsV, nsFacing, vNsNear and nsClear in
 * scope, diffuseColor.a and outgoingLight set). Uniforms nsGInk (contour half-width CSS, contour alpha, rim CSS, pixel
 * ratio), nsGInk2 (rim light, rim alpha, -, -), nsGHi (power, lo, hi, light), nsGHi2 (alpha, -, -, -), nsInkG (ink rgb
 * linear). `light` is the view-space key light. Pure. */
export function glassInkGlsl(light) {
  const L = light.map(glslFloat).join(', ');
  return `
{
	float nsPrG = max( nsGInk.w, 0.25 );
	float nsFg = max( length( vec2( dFdx( nsFacing ), dFdy( nsFacing ) ) ), 1e-5 );
	float nsDc = abs( nsFacing ) / nsFg;
	float nsWc0 = nsGInk.x * nsPrG;
	float nsWc = max( nsWc0, ${glslFloat(INK_MIN_HALF_PX)} );
	float nsCt = ( 1.0 - smoothstep( nsWc - 0.6, nsWc + 0.6, nsDc ) ) * clamp( nsWc0 / ${glslFloat(INK_MIN_HALF_PX)}, 0.0, 1.0 );
	float nsWr = nsWc + nsGInk.z * nsPrG;
	float nsRimB = ( 1.0 - smoothstep( nsWr - 0.8, nsWr + 0.8, nsDc ) ) * ( 1.0 - nsCt );
	vec3 nsHv = normalize( normalize( vec3( ${L} ) ) + nsV );
	float nsSp = pow( max( dot( nsN, nsHv ), 0.0 ), nsGHi.x );
	float nsHiA = smoothstep( nsGHi.y, nsGHi.z, nsSp );
	// only a highlight with a real shape: where the coarse glass mesh turns the step into a speck under ~2 px across (its
	// soft edge narrower than a pixel), it is left out, so the glass shows no dust and no sparkle while the view turns
	nsHiA *= smoothstep( 1.0, 2.5, ( nsGHi.z - nsGHi.y ) / max( fwidth( nsSp ), 1e-6 ) );
	float nsClr = 1.0 - nsClear * clamp( vNsNear, 0.0, 1.0 );
	outgoingLight = mix( outgoingLight, nsInkG, nsCt );
	outgoingLight += vec3( nsGInk2.x * nsRimB + nsGHi.w * nsHiA );
	diffuseColor.a = max( diffuseColor.a, nsClr * max( nsCt * nsGInk.y, max( nsRimB * nsGInk2.y, nsHiA * nsGHi2.x ) ) );
}
`;
}

/** Uniform values of the glass ink for BRAIN_INK (w of nsGInk is the pixel ratio, set per frame). Pure. */
export function glassInkUniformValues(o = BRAIN_INK) {
  const g = o.glass;
  return {
    nsGInk: [g.contourCss, g.contourAlpha, g.rimCss, 1],
    nsGInk2: [g.rimLight, g.rimAlpha, 0, 0],
    nsGHi: [g.highlight.power, g.highlight.lo, g.highlight.hi, g.highlight.light],
    nsGHi2: [g.highlight.alpha, 0, 0, 0],
    nsInkG: [srgbToLinear(o.ink[0]), srgbToLinear(o.ink[1]), srgbToLinear(o.ink[2])]
  };
}
