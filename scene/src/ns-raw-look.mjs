/** NeuroSurge: THE RAW LOOK (20 November 2026).
 *
 * The owner, Message 195: "The new look aesthetic you've provided in the recent most images is good. Apply it. But you
 * need more clear contrast and differentiation between muscle groups." Message 196: "New look for everything not just
 * body." (and: "Will raw render look improve performance?")
 *
 * "The recent most images" were close-ups drawn OFFLINE by a measuring tool, not by the game: muscle one flat rose red,
 * bone ivory, the room near-black, ONE light from up and to the side in front of the viewer, every surface shaded
 * 0.25 + 0.75 x |N.L| (matte, both sides alike, no gloss), back faces at 0.6 of that, and nothing drawn on top: no
 * outline, no ink, no tone bands, no hatching, no rim light. This module is that look as the game draws it:
 *  - RAW_LOOK.on is the ONE switch. true: the bodies, the brain, its strip, the inner parts, the organs, the eyeballs
 *    and nerves, the 3D arrows, the room and the loading picture's models are drawn in this light; false: the early
 *    comic (cel) look of 19 November comes back everywhere (ns-scene-three BODY_STYLE follows this switch).
 *  - light: the light's direction in VIEW space (x to the right of the picture, y up, z toward the viewer), as the tool
 *    took it: 0.4 right + 0.6 up + 0.7 toward the viewer. It moves with the view, like the tool's, so every picture is lit
 *    the same way whichever way you look.
 *  - ambient / direct: the shade is ambient + direct x |N.L| (two-sided: a surface turned away from the light is lit as
 *    much as one turned toward it, as in the tool). back: a back face (the inside of a mesh seen through an opening)
 *    is drawn at this share. gamma: the tool multiplied the sRGB colour by the shade; the game lights in linear light, so
 *    the shade is raised to this power first (2.2 ~ the sRGB curve), and a resting colour facing the light is exactly its
 *    sRGB value, the deepest shade 0.25 of it, as in the pictures.
 *  - flat: false = the meshes' smooth normals (the owner, Message 184: bodies "sharp and not blurry or ... rough or
 *    patchy"); true = one normal per triangle like the tool (faceted).
 *  - room: the room's darkest light, a little under the tool's background RGB [18, 18, 22] in linear light, so that with
 *    the room's own faint pool of light on the floor (ns-room ROOM.pool, the owner's "little bit of a gradient") the
 *    picture measures about 18, 18, 22 above and 22, 24, 27 under the bodies.
 *    (20 November 2026, the owner, Message 206: "let's make the background more of a black abyss, but still with a
 *    gradient": the darkest light is near black, RGB about 4, 4, 5, and the floor's pool of light (roomPool) a little
 *    stronger than the old one, so the picture still falls off from about 15 under the bodies to black at the edges.)
 *  - bone: the tool's ivory, RGB [232, 224, 205].
 *  - muscleFloor (21 November 2026, a browser hunt, H28: "a raised right forearm in shadow goes almost black against
 *    the room"; section 168 listed it: "the darkest steps go nearly black on the shaded side"): the deepest shade of
 *    the darkest rose tones (a quarter of their colour, 0.15 on a back face) measured 10 to 25 red, darker than the
 *    room. A muscle's shade is now kept, with a soft knee, from going under this LINEAR luminance (about RGB 53, 13, 14
 *    on the darkest tone: plainly dark red muscle, about twice the luminance of the room's 13 to 21 grey; 0.0065, about
 *    42, 9, 10, was tried first and measured level with the room under the raised arm); its colour is only scaled, so
 *    the hue stays, and never above the colour itself. The lighter tones are little touched (rose at the ambient shade
 *    45 -> 51 red); what is lit is not touched at all. Muscles only (the strip's black abyss and the room stay black).
 *  - muscleFloorKeep, muscleFloorRef (21 November 2026, section 188; the owner, Message 202: "muscles next to each other
 *    can be obviously told apart"): with the floor on the luminance every dark muscle met at the same dark red in the
 *    deepest shade (section 187 listed it; measured on the screen, the raised right forearm's flexors in shadow differed
 *    by 0.007 to 0.013 in OKLab). The floor now keeps the colours' ratios (keep 1): one floor on the SHADE,
 *    muscleFloor / muscleFloorRef (ref = the darkest group tone's luminance, so that tone keeps exactly section 187's
 *    floor, about RGB 53, 13, 14), and every muscle keeps its own step in the deepest shade. The cost (22 November 2026,
 *    a check: the line before said "a little lighter", which was wrong): the shade never goes under about 0.16 of the
 *    colour, so the deepest shade of every colour lighter than the darkest tone is lifted, about twice in the screen's
 *    numbers: where the surface turns fully away from the light the reference rose 51, 19, 18 -> 87, 37, 35, the pale
 *    tone 59, 31, 30 -> 110, 63, 61 and the tendon white 53, 54, 55 -> 101, 103, 104 (2.9, 3.6 and 3.7 times the
 *    light; on a back face more). The darkest tone's LOWER step goes the other way, 58, 6, 14 -> 41, 3, 7 (half the
 *    light). The lit side and the room are not changed. Kept: a lower ref lifts every muscle further and flattens the
 *    shading of all of them (ref 0.031: rose 121, 54, 51); keep 0.75 would be a middle way (computed, not drawn).
 *  - ink (20 November 2026, the owner, Message 207: "And everything should get clear outlines."): ONE rule for every
 *    outline in this look: the bodies' silhouettes and the lines where one limb or body lies over another (the game arm
 *    and the organs too; ns-outline through ns-scene-three RAW_OUTLINE), the motor strip's contour, the brain's outline
 *    and its eyes' and nerves', and the 3D arrows' contour (ns-arrows3d ARROW_LOOK_RAW): one near-black colour (sRGB
 *    0..1; hex the same), one width css (CSS px on a near thing), one opacity alpha. The line of a depth step inside a
 *    limb is lighter and thinner (innerCss, innerAlpha); a far body (the mirror body) keeps at least farShare of the
 *    width, so its limbs stay outlined. Before Message 207 the look drew no line at all except the strip's contour.
 * The activation light (a lit muscle and its area almost white), the beams, the control glows, the light-blue glass for
 * hidden things and every HTML card are signals drawn over the scene and are not changed by this look.
 *
 * Pure: no imports of Three.js, no DOM; the patches work on shader text.
 */

export const RAW_LOOK = Object.freeze({
  on: true,
  light: Object.freeze([0.4, 0.6, 0.7]),
  ambient: 0.25, direct: 0.75, back: 0.6, gamma: 2.2,
  flat: false,
  room: Object.freeze([0.0011, 0.0011, 0.0015]), roomPool: Object.freeze([0.0045, 0.0048, 0.0056]),
  bone: 0xe8e0cd, muscleFloor: 0.01, muscleFloorKeep: 1, muscleFloorRef: 0.0621,
  ink: Object.freeze({ colour: Object.freeze([0x0b / 255, 0x08 / 255, 0x09 / 255]), hex: 0x0b0809, css: 1.4, alpha: 0.95, innerCss: 0.9, innerAlpha: 0.6, farShare: 0.6 })
});

const f = v => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/** The light's unit direction (view space). Pure. */
export function rawLightDir(o = RAW_LOOK) {
  const l = o.light, n = Math.hypot(l[0], l[1], l[2]) || 1;
  return [l[0] / n, l[1] / n, l[2] / n];
}

/** The shade of a surface with unit normal n (view space): ambient + direct x |N.L|, x back on a back face; and the
 * factor the game multiplies a LINEAR colour by (the shade to the power gamma). Pure (for tests and checks). */
export function rawShade(n, front = true, o = RAW_LOOK) {
  const L = rawLightDir(o);
  const k = (o.ambient + o.direct * Math.abs(n[0] * L[0] + n[1] * L[1] + n[2] * L[2])) * (front ? 1 : o.back);
  return { shade: k, linear: Math.pow(k, o.gamma) };
}

/** GLSL that declares `float <name>` = the linear factor of the raw light for the fragment, from the view-space normal
 * expression `normalExpr` (or, with o.flat, the triangle's own normal from the derivatives of `viewPosExpr`). Pure. */
export function rawShadeGlsl(name = 'nsRawK', normalExpr = 'normal', viewPosExpr = 'vViewPosition', o = RAW_LOOK) {
  const L = rawLightDir(o);
  const n = o.flat ? `normalize( cross( dFdx( ${viewPosExpr} ), dFdy( ${viewPosExpr} ) ) )` : `normalize( ${normalExpr} )`;
  return `float ${name} = max( ( ${f(o.ambient)} + ${f(o.direct)} * abs( dot( ${n}, vec3( ${L.map(f).join(', ')} ) ) ) ) * ( gl_FrontFacing ? 1.0 : ${f(o.back)} ), 0.0 );\n` +
    `\t${name} = pow( ${name}, ${f(o.gamma)} );`;
}

/** The raw look's patch for a three.js lit material (MeshStandardMaterial / MeshPhysicalMaterial / MeshLambertMaterial
 * / MeshPhongMaterial, r170), pure on the shader text. Compose it LAST (after every other patch of the material):
 *  - the scene's lights are not computed at all (the three light includes are taken out: cheaper than the comic look's
 *    light loop with its bands, ink and highlight shapes);
 *  - right after '#include <aomap_fragment>' the reflected light becomes the albedo (diffuseColor, after every colour
 *    patch: the muscle's tone, its tendon white, the activation's white) x the raw shade, with no specular, so every
 *    patch that works on the emission (the activation glow) or on the final colour and alpha (behind the glass, the
 *    see-through windows) works as before;
 *  - (20 November 2026, a review of Body update 59; the owner, Message 203: "let's make the activation area as bright
 *    as possible") a muscle with the power-up patch (its shader has `vec4 nsPu =` and `uniform vec4 nsCharge`) keeps the
 *    HDR boost of its power-up flash that the comic patches carried: while the HDR picture is on, the peaks (gain nsPu.x
 *    above nsHdrBoost.y) brighten the emission by nsHdrBoost.x x the excess, so the cores bloom (without it the flash
 *    was about 1.8 times dimmer in the raw look). The uniform nsHdrBoost is declared here; the scene binds it
 *    (hdrBoost: true in the result).
 * - opts.floor (21 November 2026, RAW_LOOK.muscleFloor; muscles only): the shade is kept from taking the colour's
 *   luminance under this linear value: shade' = a soft maximum of the shade and min(1, floor / the colour's luminance)
 *   (knee half the floor wide), at most 1 (the full light).
 * - opts.keep, opts.ref (21 November 2026, section 188; RAW_LOOK.muscleFloorKeep, muscleFloorRef): the floor's share of
 *   the colours' own ratios. The floor on the shade is floor / ref^keep x the colour's luminance^(keep - 1): keep 0 is the
 *   plain floor above (every dark colour meets at the same luminance), keep 1 one floor on the SHADE for every colour,
 *   floor / ref (a colour of luminance ref keeps exactly the plain floor), so two muscles side by side keep the ratio of
 *   their colours in the deepest shade too. With keep 1 the floor is a constant: no division in the shader.
 * Returns { vertexShader, fragmentShader, hdrBoost } or null when a hook is missing (the material then keeps its own
 * light). */
export const RAW_HOOKS = Object.freeze({
  ao: '#include <aomap_fragment>', normal: '#include <normal_fragment_begin>',
  lights: Object.freeze(['#include <lights_fragment_begin>', '#include <lights_fragment_maps>', '#include <lights_fragment_end>'])
});
export function patchRawShaders(vertexShader, fragmentShader, o = RAW_LOOK, opts = {}) {
  const floor = opts && Number.isFinite(opts.floor) && opts.floor > 0 ? opts.floor : 0;
  const keep = opts && Number.isFinite(opts.keep) ? Math.min(1, Math.max(0, opts.keep)) : 0, ref = opts && Number.isFinite(opts.ref) && opts.ref > 0 ? opts.ref : 1;
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  // (vViewPosition, needed only for flat normals, is declared in the lights' own pars chunk of the lambert and phong
  // shaders, so it is not in their text before the includes are resolved)
  if (!fragmentShader.includes(RAW_HOOKS.ao) || !fragmentShader.includes(RAW_HOOKS.normal) || !fragmentShader.includes('reflectedLight') ||
    fragmentShader.includes('nsRawK')) return null;
  let fs = fragmentShader;
  const hdrBoost = fragmentShader.includes('vec4 nsPu =') && fragmentShader.includes('uniform vec4 nsCharge');
  for (const h of RAW_HOOKS.lights) fs = fs.split(h).join('');
  fs = fs.replace(RAW_HOOKS.ao, `${RAW_HOOKS.ao}
	{
		${rawShadeGlsl('nsRawK', 'normal', 'vViewPosition', o)}${floor ? `
		{ // the shade floor (opts.floor): never under that luminance (opts.keep: keeping a share of the colours' ratios), a soft maximum
			${keep >= 1 ? `float nsKf = ${f(Math.min(1, floor / ref))}, nsKw = 0.5 * nsKf;`
    : keep > 0 ? `float nsKf = min( 1.0, ${f(floor / Math.pow(ref, keep))} * pow( max( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 ), ${f(keep - 1)} ) ), nsKw = 0.5 * nsKf;`
    : `float nsKf = min( 1.0, ${f(floor)} / max( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 ) ), nsKw = 0.5 * nsKf;`}
			nsRawK = min( 0.5 * ( nsRawK + nsKf + sqrt( ( nsRawK - nsKf ) * ( nsRawK - nsKf ) + nsKw * nsKw ) ), 1.0 );
		}` : ''}
		reflectedLight.directDiffuse = diffuseColor.rgb * nsRawK;
		reflectedLight.indirectDiffuse = vec3( 0.0 );
		reflectedLight.directSpecular = vec3( 0.0 );
		reflectedLight.indirectSpecular = vec3( 0.0 );
	}${hdrBoost ? `
	if ( nsCharge.z > 0.5 ) totalEmissiveRadiance *= 1.0 + nsHdrBoost.x * max( nsPu.x - nsHdrBoost.y, 0.0 );` : ''}`);
  if (hdrBoost && !/uniform\s+vec4\s+nsHdrBoost\s*;/.test(fs)) fs = 'uniform vec4 nsHdrBoost;\n' + fs;
  return { vertexShader, fragmentShader: fs, hdrBoost };
}
