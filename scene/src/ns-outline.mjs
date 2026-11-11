/** NeuroSurge scene: the black ink lines of the comic look (R558, user Messages 20, 26, 27, 28, 29: outlines where limbs
 * and bodies overlap, a parting between touching muscles, "not so harsh that it hurts the viewer's eyes", "I quite like
 * the borderlands look", "the borderlands aesthetic should be applied throughout"; Message 18: "We should be able to
 * easily differentiate each brain node and muscle node from each other").
 *
 * THREE is injected (createOutlinePass({ THREE, renderer })); nothing here imports 'three', so the pure parts load in
 * Node. Built on Three.js r170 core only (WebGLRenderTarget, DepthTexture, BatchedMesh, ShaderMaterial and its standard
 * shader chunks); no add-on is needed.
 *
 * How it works (one extra geometry-only draw, two small screen passes, one screen composite; no change to any existing
 * material):
 *  1. ID PASS. Every opaque body mesh drawn in the main frame (your own body, your left arm, the mirror body and its
 *     arm, your in-place head in the view from behind) is an INSTANCE of one THREE.BatchedMesh in a private scene: a
 *     position-only copy of the same geometry, the same world matrix (the mirror's negative determinant included), the
 *     same visibility and the same faces, drawn with a flat ID material into a render target with a depth texture. The
 *     colour is the instance's code: red = the limb group (OUTLINE_GROUPS; mirror body + OUTLINE_MIRROR_OFFSET), green
 *     and blue = a 14-bit number of the mesh (each muscle and bone its own). One multi-draw call.
 *     R558 BB (Message 28, "harshness"): the ID target is SUPERSAMPLED, OUTLINE_AA.ssByLevel times the drawing buffer
 *     in each direction (2 at the better quality levels), so each screen pixel sees 2 x 2 samples of the boundaries.
 *  2. EDGE PASS (supersampled). Each sample next to a boundary, on the NEARER side, gets the boundary's class:
 *       - strong: between two bodies (yours and the mirror), between two limbs that do not join (a hand over a thigh,
 *         a forearm in front of the chest, one leg against the other), and where a joining limb folds over its
 *         neighbour with a depth step (a forearm folded onto the upper arm);
 *       - silhouette: around each body against the brain or the background;
 *       - inner: a depth step inside one limb (fingers over the palm, a lifted outer muscle over a deep one);
 *       - parting: between neighbouring muscles (or a muscle and a bone) that touch without a depth step, so each
 *         muscle reads as its own piece (Message 26); drawn on one side only.
 *  3. INK PASS (screen pixels). For each pixel, each of its samples takes the strongest line whose boundary sample lies
 *     within the line's width (the bold lines spread over their whole limb group, the inner and parting lines over their
 *     own mesh), with a one-sample soft edge; the pixel's ink is the mean of its samples: smooth coverage, no stair
 *     steps on diagonals, no crawling while the view turns (the boundary is known to half a pixel). The WEIGHT follows
 *     the style guide: bold silhouettes and overlaps, medium inner steps, fine partings, all tapered by the on-screen
 *     size of a centimetre at the pixel's depth (OUTLINE.taper*), so small or far figures get thin lines and lose the
 *     inner and parting lines before they could clot. The optional soft depth shading (OUTLINE_AO) is computed here
 *     too. The ID, edge and ink passes are skipped when nothing changed.
 *  4. COMPOSITE. A full-screen triangle in the MAIN scene, first in the transparent list (renderOrder OUTLINE.renderOrder),
 *     lays the ink (near-black, OUTLINE.colour) and the shading over the frame. Because it is drawn after the opaque
 *     bodies and BEFORE every transparent pass, the glass brain, the motor areas, the glow links and halos, the hints and
 *     the 3D arrows (drawn last, without depth test) are blended over the lines exactly as they are blended over the
 *     bodies: an arrow stays on top, a body behind the glass keeps its glass tint on its lines too, and glass never gets
 *     lines from here (it is not in the batch; the brain, glass and arrows draw their own ink in their materials). The
 *     HUD is HTML and is not touched.
 *  Line widths are CSS pixels (times the drawing buffer's pixel ratio and the supersampling); below one sample a line
 *  keeps one sample and fades instead.
 *
 * Display only: the codes, depths and lines are a drawing aid. They do not change a pose, a pick, a colour meaning, an
 * activity value or a collision.
 */

/** Display choices (R558 O, re-tuned in R558 BB for the comic ink look; see the BB report).
 *  colour: the ink as drawn on the screen (sRGB 0..1): near-black #0b0809 (style guide), not grey and not a coloured shade.
 *  boldCss / innerCss / fineCss: line widths in CSS pixels on a NEAR body (style guide weight hierarchy: silhouettes and
 *  overlaps 2-3 px, inner depth steps 1-1.5 px, partings under 1 px).
 *  strong / silhouette / inner / faint: line opacities (faint = the parting between touching muscles).
 *  taperFullPxCm / taperMin: the widths are scaled by clamp(sqrt(px per cm / taperFullPxCm), taperMin, 1), px per cm being
 *  the CSS pixels one centimetre covers at the pixel's distance (your hands about 10, your knees about 6, the mirror body
 *  about 1.5): a far or small figure gets thinner lines, never a black clot.
 *  detailFromPxCm / detailFullPxCm: the inner and parting lines fade in between these on-screen sizes of one centimetre;
 *  strong and silhouette lines are always drawn. R558 BB: 1.8 / 3.5 -> 0.9 / 2.6, so the small mirror body (about 1.6 px
 *  per cm at the start) keeps faint, thin partings (Message 26: each muscle its own piece) instead of none; with the
 *  taper they stay under half a pixel wide there, so they cannot clot.
 *  maxRadiusSs: the widest line in supersampled pixels (the ink pass's search radius).
 *  stripCss / stripAlpha: the motor strip's silhouette (R558 BB, Message 24): seen from above it is the central and
 *  precentral sulci that bound the strip, plus its medial edge and its end at the Sylvian fissure; a bold line inside
 *  the strip where it meets the glass or the background (where a body lies next to it, the body's own line is drawn).
 *  holeCss (R558 BB check; lead note on the lifted build; Message 28 "clotted dense lines"): a foreign region (the
 *  background, a deeper mesh, another limb seen through) narrower than this along the probe, with the same limb (or a
 *  limb joining it at a joint: the hand's bones and the forearm muscles' finger tendons) at about the same depth on its
 *  far side, is a speck in a hairline gap or a small hole (a lifted muscle's parting showing the deeper muscle, a hole in
 *  a mesh): it gets no ring of ink, so those specks no longer draw rows of tiny dark rings. Never under the old
 *  one-sample pinhole rule. (Tried: also giving slits up to 6 CSS px the inner weight; it hardly changed the pictures,
 *  the remaining hand loops being real overlap outlines, and its longer probes cost frame rate in the dance. Rejected.)
 *  thinShare / thinFrom / thinFull (Message 30, "The bone tips probably shouldn't be so spikey"): where the bold boundary
 *  lies all round a sample (a thin finger, a tendon, the point of a tip: the mean direction to the boundary samples
 *  within reach is short) the bold line keeps only thinShare of its width, full width from a one-sidedness of thinFrom
 *  to thinFull (1 = boundary on one side only, a plain edge). So the ink tapers at points instead of drawing needles.
 *  jumpAdjM / jumpSameM / jumpRel: the depth step (metres; jumpRel times the pixel's distance is added) above which a
 *  boundary inside one limb, or between two joining limbs, counts as an overlap (strong line).
 *  levelM: depth difference under which two touching muscles count as level (the parting is then drawn on the side
 *  of the higher mesh number only, so it stays one line wide).
 *  renderOrder: the composite's place in the transparent list (first). */
export const OUTLINE = Object.freeze({
  colour: Object.freeze([0x0b / 255, 0x08 / 255, 0x09 / 255]),
  boldCss: 2.4, innerCss: 1.2, fineCss: 0.8,
  strong: 1, silhouette: 0.94, inner: 0.8, faint: 0.7,
  taperFullPxCm: 7, taperMin: 0.42,
  detailFromPxCm: 0.9, detailFullPxCm: 2.6,
  maxRadiusSs: 7,
  stripCss: 2.0, stripAlpha: 0.95, holeCss: 2.0,
  thinShare: 0.45, thinFrom: 0.25, thinFull: 0.65,
  jumpAdjM: 0.012, jumpSameM: 0.022, jumpRel: 0.015, levelM: 0.0015,
  renderOrder: -1e6
});
/** Anti-aliasing of the lines (R558 BB, Message 28). ssByLevel: supersampling of the ID pass per ns-scene-three
 * QUALITY_LEVELS index (full, 0.75, 0.5, lite 0.5, lod 0.5, lod 0.4): 2 x 2 samples per drawing-buffer pixel at the
 * first four, 1 at the two cheapest (their buffer is drawn at a half or less and stretched by the browser, which
 * softens the lines anyway). maxSsPixels: a supersampled target is never larger than this many samples (a 4K buffer then
 * keeps 1 sample) and never larger than the GPU's texture limit. */
export const OUTLINE_AA = Object.freeze({ ssByLevel: Object.freeze([2, 2, 2, 2, 1, 1]), maxSsPixels: 16.7e6 });

/** Depth shading (soft ambient occlusion from the outline pass's own depths; display choices, see the O report).
 *  strength: the darkest a fully enclosed crevice gets (share of its light taken away); radiusM: the world radius of
 *  the taps (metres); bias: a share of the radius ignored (no self-shadow on gently curved muscle); maxRadiusPx: the tap
 *  radius cap in CSS pixels (times the pixel ratio). Drawn only at the full picture quality (QUALITY_LEVELS[0]). */
export const OUTLINE_AO = Object.freeze({ strength: 0.4, radiusM: 0.035, bias: 0.06, maxRadiusPx: 40 });

/** Limb groups of one body (red channel of the ID pass); 0 = no body. The mirror body adds OUTLINE_MIRROR_OFFSET. */
export const OUTLINE_GROUPS = Object.freeze({
  trunk: 1, head: 2, lUpper: 3, lFore: 4, lHand: 5, rUpper: 6, rFore: 7, rHand: 8,
  lThigh: 9, lShank: 10, lFoot: 11, rThigh: 12, rShank: 13, rFoot: 14
});
export const OUTLINE_MIRROR_OFFSET = 16;
/** Groups that join each other at a joint (same body): a boundary between them without a depth step is a muscle
 * parting (faint), not an overlap. Every other pair of groups is set apart by a strong line. */
export const OUTLINE_ADJACENT = Object.freeze([
  ['trunk', 'head'], ['trunk', 'lUpper'], ['trunk', 'rUpper'], ['lUpper', 'lFore'], ['lFore', 'lHand'],
  ['rUpper', 'rFore'], ['rFore', 'rHand'], ['trunk', 'lThigh'], ['trunk', 'rThigh'],
  ['lThigh', 'lShank'], ['lShank', 'lFoot'], ['rThigh', 'rShank'], ['rShank', 'rFoot']
].map(p => Object.freeze(p)));

/** The limb group of an ns-body rig segment (BODY_SEGMENTS), or 0 when unknown. The shoulder girdles ride the trunk. */
export function outlineGroupForBodySegment(segment) {
  const s = typeof segment === 'string' ? segment : '';
  const G = OUTLINE_GROUPS;
  if (/^(pelvis|lumbar|thorax|[lr]_girdle)$/.test(s)) return G.trunk;
  if (/^(cervical|skull|mandible|hyoid)$/.test(s)) return G.head;
  const m = /^([lr])_(.+)$/.exec(s);
  if (!m) return 0;
  const L = m[1] === 'l', rest = m[2];
  if (rest === 'upperarm') return L ? G.lUpper : G.rUpper;
  if (rest === 'forearm' || rest === 'radius' || rest === 'ulna') return L ? G.lFore : G.rFore;
  if (rest === 'hand' || /^(thumb|index|middle|ring|little)_/.test(rest)) return L ? G.lHand : G.rHand;
  if (rest === 'thigh' || rest === 'patella') return L ? G.lThigh : G.rThigh;
  if (rest === 'shank') return L ? G.lShank : G.rShank;
  if (rest === 'foot' || rest === 'toes' || rest === 'hallux') return L ? G.lFoot : G.rFoot;
  return 0;
}
/** The limb group of a left-arm rig segment (ns-rig SEGMENTS): the left game arm. */
export function outlineGroupForArmSegment(segment) {
  const s = typeof segment === 'string' ? segment : '';
  if (s === 'upperarm') return OUTLINE_GROUPS.lUpper;
  if (s === 'forearm' || s === 'ulna' || /^forearm_tw\d$/.test(s)) return OUTLINE_GROUPS.lFore;
  return OUTLINE_GROUPS.lHand;
}
/** A coarse group from a scene body part and side (-1 left, +1 right) when no rig segment is known. */
export function outlineGroupForPart(part, side = 0) {
  const G = OUTLINE_GROUPS;
  if (part === 'legs') return side < 0 ? G.lThigh : G.rThigh;
  if (part === 'rightArm') return G.rUpper;
  if (part === 'leftArm') return G.lUpper;
  if (part === 'neck' || part === 'face') return G.head;
  return G.trunk;
}
/** How a muscle that spans several limb parts gets ONE group (R558 O check; display choices).
 * Plain "most weight wins" put several forearm and shank muscles in the hand or foot, because their long tendons
 * into the fingers and toes carry much of the weight (measured on the posed body: right extensor digitorum hand 0.54 /
 * forearm 0.46, right palmaris longus hand 0.76 / forearm 0.14 / upper arm 0.11, the long toe extensors and flexors
 * foot 0.52 and 0.63, one hamstring piece shank 0.39 / thigh 0.37 / pelvis 0.25). A hand and an upper arm do not
 * join, so the jagged origin of palmaris longus at the elbow got a STRONG line against the upper arm muscles and
 * stood out (the user's Message 21, "bits coming out at the elbow"). Two rules, both anatomical:
 *  - a muscle whose weights reach two parts of one limb chain that do not join (upper arm and hand, pelvis and shank,
 *    thigh and foot; each with at least spanMin of the weight) runs along the part between them, so it takes that
 *    part (the heaviest one in between);
 *  - a muscle that would be hand or foot keeps the forearm or shank when that part carries at least proximalShare:
 *    the belly of an extrinsic finger or toe muscle lies there. The intrinsic hand and foot muscles carry no forearm
 *    or shank weight and stay hand and foot. */
export const OUTLINE_GROUPING = Object.freeze({ spanMin: 0.05, proximalShare: 0.25 });
const OUTLINE_CHAINS = Object.freeze([
  ['trunk', 'lUpper', 'lFore', 'lHand'], ['trunk', 'rUpper', 'rFore', 'rHand'],
  ['trunk', 'lThigh', 'lShank', 'lFoot'], ['trunk', 'rThigh', 'rShank', 'rFoot']
].map(c => Object.freeze(c.map(k => OUTLINE_GROUPS[k]))));
/** One group from group shares (a Map or [[group, weight], ...]; any positive scale) by the OUTLINE_GROUPING rules;
 * 0 when there is no positive share. */
export function outlineGroupForShares(shares, o = OUTLINE_GROUPING) {
  const s = new Map();
  let total = 0;
  for (const [g, w] of (shares instanceof Map ? shares : Array.isArray(shares) ? shares : [])) {
    const k = g | 0, v = Number(w);
    if (k > 0 && Number.isFinite(v) && v > 0) { s.set(k, (s.get(k) || 0) + v); total += v; }
  }
  if (!(total > 0)) return 0;
  const share = g => (s.get(g) || 0) / total;
  let best = 0, bw = -Infinity;
  for (const [g, w] of s) if (w > bw || (w === bw && g < best)) { best = g; bw = w; }
  // The limb chain the muscle belongs to: the one with the most weight outside the trunk.
  let chain = null, cw = 0;
  for (const c of OUTLINE_CHAINS) { const w = share(c[1]) + share(c[2]) + share(c[3]); if (w > cw) { cw = w; chain = c; } }
  if (!chain) return best;
  let lo = -1, hi = -1;
  for (let i = 0; i < chain.length; i++) if (share(chain[i]) >= o.spanMin) { if (lo < 0) lo = i; hi = i; }
  if (lo >= 0 && hi - lo >= 2) {
    let mid = lo + 1, mw = -1;
    for (let i = lo + 1; i < hi; i++) if (share(chain[i]) > mw) { mw = share(chain[i]); mid = i; }
    return chain[mid];
  }
  if (best === chain[3] && share(chain[2]) >= o.proximalShare) return chain[2];
  return best;
}
/** The group of a segment blend [[segment, weight], ...] (ns-body rig meshSegment[id].blend) by outlineGroupForShares. */
export function outlineGroupForBlend(blend, fallbackSegment = null) {
  const sums = new Map();
  if (Array.isArray(blend)) for (const b of blend) {
    if (!Array.isArray(b)) continue;
    const g = outlineGroupForBodySegment(b[0]), w = Number(b[1]);
    if (g > 0 && Number.isFinite(w) && w > 0) sums.set(g, (sums.get(g) || 0) + w);
  }
  return outlineGroupForShares(sums) || outlineGroupForBodySegment(fallbackSegment);
}
/** Adjacency table (size x size bytes, row = group code a, column = code b): 255 where a and b are in the same body and
 * are the same group or join at a joint, else 0. Codes 1..14 are your body, 17..30 the mirror body. */
export function outlineAdjacency(size = 32) {
  const t = new Uint8Array(size * size);
  const set = (a, b) => { if (a < size && b < size) { t[a * size + b] = 255; t[b * size + a] = 255; } };
  for (const off of [0, OUTLINE_MIRROR_OFFSET]) {
    for (const g of Object.values(OUTLINE_GROUPS)) set(g + off, g + off);
    for (const [a, b] of OUTLINE_ADJACENT) set(OUTLINE_GROUPS[a] + off, OUTLINE_GROUPS[b] + off);
  }
  return t;
}

/* ID pass shaders for one THREE.BatchedMesh (r170 multi-draw): the instance's world matrix and its code come from the
 * batch's textures (batching chunks); the code is passed FLAT so it reaches the target exactly. Green carries two flags in
 * its top bits: 128 = the instance's matrix mirrors (negative determinant), 64 = the source material is double-sided.
 * The material is double-sided and a fragment keeps only the faces the source material draws (front faces, which a
 * mirroring matrix turns clockwise on the screen), so one batch serves your body and the mirror body alike. */
const ID_VS = `
#include <common>
#include <batching_pars_vertex>
#include <logdepthbuf_pars_vertex>
flat varying vec3 vNsId;
void main() {
	#include <batching_vertex>
	#include <begin_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#ifdef USE_BATCHING_COLOR
	vNsId = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	#else
	vNsId = vec3( 0.0 );
	#endif
}`;
const ID_FS = `
flat varying vec3 vNsId;
#include <logdepthbuf_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	float gb = floor( vNsId.g * 255.0 + 0.5 );
	bool flip = gb >= 128.0;
	if ( flip ) gb -= 128.0;
	bool dbl = gb >= 64.0;
	if ( dbl ) gb -= 64.0;
	if ( ! dbl && gl_FrontFacing == flip ) discard;
	gl_FragColor = vec4( vNsId.r, gb / 255.0, vNsId.b, 1.0 );
}`;

/** Line width scale for an on-screen size of one centimetre (CSS px per cm at the pixel's distance), pure. */
export function outlineTaper(pxPerCm, o = OUTLINE) {
  const v = Number.isFinite(pxPerCm) && pxPerCm > 0 ? pxPerCm : 0;
  return Math.min(1, Math.max(o.taperMin, Math.sqrt(v / o.taperFullPxCm)));
}
/** Line widths in drawing-buffer pixels { bold, inner, fine } for a pixel ratio and an on-screen cm size (pure). */
export function outlineWidthsPx(pixelRatio, pxPerCm = Infinity, o = OUTLINE) {
  const pr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1, t = outlineTaper(pxPerCm, o);
  return { bold: o.boldCss * pr * t, inner: o.innerCss * pr * t, fine: o.fineCss * pr * t };
}
/** The bold line width in drawing-buffer pixels at full size (kept for the O checks: CSS width times the ratio). */
export function outlineWidthPx(pixelRatio, o = OUTLINE) {
  const pr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  return o.boldCss * pr;
}
/** Supersampling of the ID pass (pure): OUTLINE_AA.ssByLevel[level], dropped to 1 when the supersampled target would
 * exceed maxSsPixels or the texture limit. */
export function outlineSsFactor(level, bufW, bufH, maxTexture = 8192, aa = OUTLINE_AA) {
  const L = aa.ssByLevel, i = Number.isInteger(level) ? Math.min(L.length - 1, Math.max(0, level)) : 0;
  const k = Math.max(1, Math.floor(L[i] || 1));
  if (k === 1) return 1;
  const w = Math.max(1, bufW | 0), h = Math.max(1, bufH | 0);
  if (k * w > maxTexture || k * h > maxTexture || k * k * w * h > aa.maxSsPixels) return 1;
  return k;
}
const SCREEN_VS = `
void main() {
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;
const COMMON_GLSL = `
precision highp float;
precision highp int;
uniform sampler2D tId;
uniform highp sampler2D tDepth;
uniform ivec2 uSize;  // supersampled target size
uniform vec4 uView;   // x: unused, y: near, z: far, w: 1 perspective / 0 orthographic
float viewDist( float d ) {
	if ( uView.w > 0.5 ) return ( uView.y * uView.z ) / ( uView.z - ( uView.z - uView.y ) * d );
	return uView.y + d * ( uView.z - uView.y );
}
int groupOf( vec4 c ) { return int( c.r * 255.0 + 0.5 ); }
int meshOf( vec4 c ) { return int( c.g * 255.0 + 0.5 ) * 256 + int( c.b * 255.0 + 0.5 ); } // 14 bits (flags removed)
`;
/* EDGE PASS (supersampled): the class of the boundary next to this sample, drawn on the nearer side (4 strong, 3
 * silhouette, 2 inner step, 1 parting; 0 none). Output: (class, mesh high, mesh low, group) / 255. */
const EDGE_FS = COMMON_GLSL + `
uniform sampler2D tAdj;
uniform sampler2D tStrip; // the motor strip's coverage where it is in front of the bodies (r > 0.5)
uniform vec4 uJump;   // jumpAdjM, jumpSameM, jumpRel, levelM
uniform float uStripOn;
uniform int uHole;    // probe reach in samples (OUTLINE.holeCss), 2 .. 8
// A speck or small hole next to this sample (OUTLINE.holeCss): walk on from the neighbour along the same step while the
// samples stay in the foreign region (the background for gf == 0, else that one mesh); true when, within uHole samples,
// the walk comes out on this sample's own limb group (or a limb joining it, OUTLINE_ADJACENT) at about its depth.
bool thinGap( ivec2 p, ivec2 o, int gf, int mf, int g, float z ) {
	for ( int k = 2; k <= 8; k ++ ) {
		if ( k > uHole ) break;
		ivec2 r = p + k * o;
		if ( r.x < 0 || r.y < 0 || r.x >= uSize.x || r.y >= uSize.y ) return false;
		vec4 cr = texelFetch( tId, r, 0 );
		int gr = groupOf( cr );
		if ( gf == 0 ? gr == 0 : ( gr == gf && meshOf( cr ) == mf ) ) continue;
		if ( gr == 0 || texelFetch( tAdj, ivec2( gr, g ), 0 ).r < 0.5 ) return false;
		return abs( viewDist( texelFetch( tDepth, r, 0 ).r ) - z ) < uJump.y + uJump.z * z;
	}
	return false;
}
void main() {
	ivec2 p = ivec2( gl_FragCoord.xy );
	vec4 c = texelFetch( tId, p, 0 );
	int g = groupOf( c );
	// The strip's silhouette: a covered sample next to an uncovered one that shows no body (background or glass).
	bool stripEdge = false;
	if ( uStripOn > 0.5 && texelFetch( tStrip, p, 0 ).r > 0.5 ) {
		for ( int i = 0; i < 8; i ++ ) {
			ivec2 o = i == 0 ? ivec2( 1, 0 ) : i == 1 ? ivec2( - 1, 0 ) : i == 2 ? ivec2( 0, 1 ) : i == 3 ? ivec2( 0, - 1 ) :
				i == 4 ? ivec2( 1, 1 ) : i == 5 ? ivec2( - 1, 1 ) : i == 6 ? ivec2( 1, - 1 ) : ivec2( - 1, - 1 );
			ivec2 q = clamp( p + o, ivec2( 0 ), uSize - 1 );
			if ( texelFetch( tStrip, q, 0 ).r < 0.5 && groupOf( texelFetch( tId, q, 0 ) ) == 0 ) { stripEdge = true; break; }
		}
	}
	if ( g == 0 ) {
		if ( ! stripEdge ) discard;
		gl_FragColor = vec4( 0.0, 128.0 / 255.0, 0.0, 0.0 );
		return;
	}
	int m = meshOf( c );
	float z = viewDist( texelFetch( tDepth, p, 0 ).r );
	bool mirror = g >= 16;
	int cls = 0;
	for ( int i = 0; i < 8; i ++ ) {
		ivec2 o = i == 0 ? ivec2( 1, 0 ) : i == 1 ? ivec2( - 1, 0 ) : i == 2 ? ivec2( 0, 1 ) : i == 3 ? ivec2( 0, - 1 ) :
			i == 4 ? ivec2( 1, 1 ) : i == 5 ? ivec2( - 1, 1 ) : i == 6 ? ivec2( 1, - 1 ) : ivec2( - 1, - 1 );
		ivec2 q = clamp( p + o, ivec2( 0 ), uSize - 1 );
		vec4 cn = texelFetch( tId, q, 0 );
		int gn = groupOf( cn );
		int mn = meshOf( cn );
		if ( gn == g && mn == m ) continue;
		int k;
		if ( gn == 0 ) {
			// a pinhole (a gap one sample wide in a mesh, mostly in the Low-quality copies): no ring of ink round it
			if ( groupOf( texelFetch( tId, clamp( p + 2 * o, ivec2( 0 ), uSize - 1 ), 0 ) ) == g ) continue;
			if ( thinGap( p, o, 0, 0, g, z ) ) continue; // a hole up to OUTLINE.holeCss wide: no ring of ink
			k = 3;
		} else {
			float zn = viewDist( texelFetch( tDepth, q, 0 ).r );
			float dz = zn - z;
			if ( dz < - uJump.w ) continue; // the neighbour is nearer: the line is drawn on its side
			if ( thinGap( p, o, gn, mn, g, z ) ) continue; // a speck of a deeper mesh (or limb) in a hairline gap: no ring
			if ( mirror != ( gn >= 16 ) ) k = 4;
			else if ( texelFetch( tAdj, ivec2( gn, g ), 0 ).r < 0.5 ) k = 4;
			else if ( gn != g && dz > uJump.x + uJump.z * z ) k = 4; // a joining limb folded over
			else if ( gn == g && dz > uJump.y + uJump.z * z ) k = 2; // a step inside one limb
			else {
				if ( dz <= uJump.w && m < mn ) continue; // level partings: one side only
				k = 1;
			}
		}
		cls = max( cls, k );
	}
	if ( cls == 0 && ! stripEdge ) discard;
	gl_FragColor = vec4( float( cls ) / 255.0, c.g + ( stripEdge ? 128.0 / 255.0 : 0.0 ), c.b, c.r );
}`;
/* INK PASS (drawing-buffer pixels). Each of the pixel's uSS x uSS samples takes the strongest line whose boundary sample
 * (edge pass) lies within the line's width: coverage clamp( width - r, 0, 1 ) for a boundary sample r samples away (it
 * sits half a sample from the boundary, so this is a one-sample soft edge). Bold lines (strong, silhouette) spread over
 * their limb group, inner and parting lines over their own mesh. The pixel's ink is the MEAN over its samples (smooth
 * coverage). Widths taper with the on-screen size of a centimetre; inner and parting lines fade on small figures.
 * Optional soft ambient occlusion (uAo.x > 0) from the same depths. Output: r = ink, g = occlusion x strength. */
const INK_FS = COMMON_GLSL + `
uniform sampler2D tEdge;
uniform sampler2D tStrip;
uniform vec4 uStrip;  // x: strip line width (CSS px), y: its opacity, z: on
uniform int uSS;
uniform vec4 uWidth;  // bold, inner, fine (CSS px), w: supersampled px per CSS px
uniform vec4 uAlpha;  // strong, silhouette, inner, parting
uniform vec4 uTaper;  // x: CSS px per cm at 1 m, y: taper full px per cm, z: taper minimum, w: max radius (samples)
uniform vec2 uDetail; // inner / parting fade: start, full (CSS px per cm)
uniform vec4 uAo;     // x: strength (0 = off), y: radius (m), z: bias (share of the radius), w: max radius (samples)
uniform vec2 uProj;   // projection matrix [0][0], [1][1]
uniform vec3 uThin;   // x: thin width share, y / z: one-sidedness of the boundary at which the full width starts / is reached
vec3 viewPos( ivec2 q, float dist ) {
	vec2 ndc = ( vec2( q ) + 0.5 ) / vec2( uSize ) * 2.0 - 1.0;
	return vec3( ndc.x * dist / uProj.x, ndc.y * dist / uProj.y, - dist );
}
/* Ambient occlusion (McGuire et al. 2012, "Scalable Ambient Obscurance", estimator with the radius falloff), on the body
 * depths only: 16 taps on a fixed golden-angle spiral (no per-pixel noise, so no grain and no blur pass is needed), the
 * normal from the neighbouring depths. The brain, the glass and the background never occlude (not in the ID pass). */
float occlusion( ivec2 p, float z ) {
	vec3 P = viewPos( p, z );
	float zl = viewDist( texelFetch( tDepth, clamp( p - ivec2( 1, 0 ), ivec2( 0 ), uSize - 1 ), 0 ).r );
	float zr = viewDist( texelFetch( tDepth, clamp( p + ivec2( 1, 0 ), ivec2( 0 ), uSize - 1 ), 0 ).r );
	float zd = viewDist( texelFetch( tDepth, clamp( p - ivec2( 0, 1 ), ivec2( 0 ), uSize - 1 ), 0 ).r );
	float zu = viewDist( texelFetch( tDepth, clamp( p + ivec2( 0, 1 ), ivec2( 0 ), uSize - 1 ), 0 ).r );
	vec3 dx = abs( zr - z ) < abs( z - zl ) ? viewPos( p + ivec2( 1, 0 ), zr ) - P : P - viewPos( p - ivec2( 1, 0 ), zl );
	vec3 dy = abs( zu - z ) < abs( z - zd ) ? viewPos( p + ivec2( 0, 1 ), zu ) - P : P - viewPos( p - ivec2( 0, 1 ), zd );
	vec3 N = normalize( cross( dx, dy ) );
	if ( N.z < 0.0 ) N = - N;
	float radius = uAo.y;
	float rPx = min( uAo.w, radius * uProj.y * 0.5 * float( uSize.y ) / z );
	if ( rPx < 1.5 ) return 0.0;
	float sum = 0.0;
	for ( int i = 0; i < 16; i ++ ) {
		float t = ( float( i ) + 0.5 ) / 16.0;
		float ang = float( i ) * 2.39996323;
		ivec2 q = p + ivec2( round( vec2( cos( ang ), sin( ang ) ) * t * rPx ) );
		if ( q.x < 0 || q.y < 0 || q.x >= uSize.x || q.y >= uSize.y ) continue;
		float dq = texelFetch( tDepth, q, 0 ).r;
		if ( dq >= 1.0 ) continue;
		vec3 v = ( viewPos( q, viewDist( dq ) ) - P ) / radius;
		float vv = dot( v, v ), vn = dot( v, N );
		float f = max( 1.0 - vv, 0.0 );
		sum += f * f * f * max( ( vn - uAo.z ) / ( 0.01 + vv ), 0.0 );
	}
	return clamp( sum * 2.0 / 16.0, 0.0, 1.0 );
}
void main() {
	ivec2 o = ivec2( gl_FragCoord.xy );
	ivec2 b = o * uSS;
	int n = uSS * uSS;
	int gs[ 4 ]; int ms[ 4 ]; ivec2 ps[ 4 ]; bool st[ 4 ];
	float zMin = 1e9; int body = 0; int first = -1; int strip = 0;
	for ( int i = 0; i < 4; i ++ ) {
		gs[ i ] = 0; ms[ i ] = 0; ps[ i ] = b + ivec2( i - 2 * ( i / 2 ), i / 2 ); st[ i ] = false;
		if ( i >= n ) continue;
		if ( uStrip.z > 0.5 && texelFetch( tStrip, min( ps[ i ], uSize - 1 ), 0 ).r > 0.5 ) { st[ i ] = true; strip ++; }
		vec4 c = texelFetch( tId, min( ps[ i ], uSize - 1 ), 0 );
		gs[ i ] = groupOf( c ); ms[ i ] = meshOf( c );
		if ( gs[ i ] == 0 ) continue;
		float zi = viewDist( texelFetch( tDepth, min( ps[ i ], uSize - 1 ), 0 ).r );
		if ( zi < zMin ) { zMin = zi; first = i; }
		body ++;
	}
	if ( body == 0 && strip == 0 ) discard;
	float pxcm = body > 0 ? uTaper.x / max( zMin, 1e-3 ) : 1e3;
	float taper = clamp( sqrt( pxcm / uTaper.y ), uTaper.z, 1.0 );
	float detail = smoothstep( uDetail.x, uDetail.y, pxcm );
	float k = uWidth.w;
	float wB = uWidth.x * taper * k, wI = uWidth.y * taper * k, wF = uWidth.z * taper * k;
	float wS = uStrip.x * k;
	int R = int( ceil( max( body > 0 ? wB : 0.0, strip > 0 ? wS : 0.0 ) ) );
	R = R < 1 ? 1 : R > int( uTaper.w ) ? int( uTaper.w ) : R;
	float sb0 = 0.0, sb1 = 0.0, sb2 = 0.0, sb3 = 0.0;
	// Per sample: the ink at full width, the ink at the thin width, and the directions to the bold boundary samples
	// that reach it. A sample with bold boundary on one side only (an edge) keeps the full width; one with boundary
	// around it (a thin finger, tendon or tip) gets the thin width, so points and slivers are not inked into needles.
	float bestF[ 4 ]; float bestT[ 4 ]; vec2 dirs[ 4 ]; float cnts[ 4 ];
	for ( int i = 0; i < 4; i ++ ) { bestF[ i ] = 0.0; bestT[ i ] = 0.0; dirs[ i ] = vec2( 0.0 ); cnts[ i ] = 0.0; }
	// Only a line several samples wide can be tapered: a 1-2 sample line has its boundary samples on both sides along
	// the line itself (they cancel), so the measure is skipped there (else the lines break into dots at Low quality).
	float thinK = mix( 1.0, uThin.x, smoothstep( 2.5, 4.5, wB ) );
	for ( int dy = - ${OUTLINE.maxRadiusSs}; dy <= ${OUTLINE.maxRadiusSs} + 1; dy ++ ) {
		if ( dy < - R || dy > R + uSS - 1 ) continue;
		for ( int dx = - ${OUTLINE.maxRadiusSs}; dx <= ${OUTLINE.maxRadiusSs} + 1; dx ++ ) {
			if ( dx < - R || dx > R + uSS - 1 ) continue;
			ivec2 e = b + ivec2( dx, dy );
			if ( e.x < 0 || e.y < 0 || e.x >= uSize.x || e.y >= uSize.y ) continue;
			vec4 E = texelFetch( tEdge, e, 0 );
			int cls = int( E.r * 255.0 + 0.5 );
			int eg = int( E.g * 255.0 + 0.5 );
			if ( eg >= 128 ) {
				eg -= 128;
				// a strip silhouette sample: ink over the covered samples within the strip line's width
				for ( int i = 0; i < 4; i ++ ) {
					if ( i >= n || ! st[ i ] ) continue;
					float cs = uStrip.y * clamp( wS - length( vec2( ps[ i ] - e ) ), 0.0, 1.0 );
					if ( i == 0 ) sb0 = max( sb0, cs ); else if ( i == 1 ) sb1 = max( sb1, cs ); else if ( i == 2 ) sb2 = max( sb2, cs ); else sb3 = max( sb3, cs );
				}
			}
			if ( cls == 0 ) continue;
			int ge = int( E.a * 255.0 + 0.5 );
			int me = eg * 256 + int( E.b * 255.0 + 0.5 );
			bool bold = cls >= 3;
			float w = bold ? wB : cls == 2 ? wI : wF;
			float a = cls == 4 ? uAlpha.x : cls == 3 ? uAlpha.y : cls == 2 ? uAlpha.z * detail : uAlpha.w * detail;
			if ( a <= 0.0 ) continue;
			for ( int i = 0; i < 4; i ++ ) {
				if ( i >= n || gs[ i ] != ge || ( ! bold && ms[ i ] != me ) ) continue;
				vec2 d = vec2( e - ps[ i ] );
				float r = length( d );
				bestF[ i ] = max( bestF[ i ], a * clamp( w - r, 0.0, 1.0 ) );
				bestT[ i ] = max( bestT[ i ], a * clamp( w * thinK - r, 0.0, 1.0 ) );
				if ( bold && r > 1.0 && r < w + 1.0 ) { dirs[ i ] += d / r; cnts[ i ] += 1.0; }
			}
		}
	}
	float ink = 0.0;
	for ( int i = 0; i < 4; i ++ ) {
		if ( i >= n ) continue;
		float side = cnts[ i ] > 0.0 ? length( dirs[ i ] ) / cnts[ i ] : 1.0; // 1: boundary on one side, 0: all round
		ink += mix( bestT[ i ], bestF[ i ], smoothstep( uThin.y, uThin.z, side ) );
	}
	ink /= float( n );
	float occ = 0.0;
	if ( uAo.x > 0.0 && first >= 0 && body > 0 ) occ = uAo.x * occlusion( ps[ first ], zMin ) * float( body ) / float( n );
	float sInk = ( sb0 + sb1 + sb2 + sb3 ) / float( n );
	if ( ink <= 0.002 && occ <= 0.002 && sInk <= 0.002 ) discard;
	gl_FragColor = vec4( ink, occ, sInk, 1.0 );
}`;
/* STRIP COMPOSITE (main scene, right after the motor areas): the strip's silhouette ink (ink target b). */
const STRIP_COMPOSITE_FS = `
precision highp float;
uniform sampler2D tInk;
uniform vec3 uColour; // linear
void main() {
	float a = texelFetch( tInk, ivec2( gl_FragCoord.xy ), 0 ).b;
	if ( a <= 0.003 ) discard;
	gl_FragColor = vec4( linearToOutputTexel( vec4( uColour, 1.0 ) ).rgb * a, a );
}`;
/* COMPOSITE (main scene): the ink and the shading over the frame drawn so far, premultiplied: rgb = ink colour x a,
 * alpha = 1 - (1 - occlusion) x (1 - a). The colour goes through Three's output transfer (the canvas or a linear target). */
const COMPOSITE_FS = `
precision highp float;
uniform sampler2D tInk;
uniform vec3 uColour; // linear
void main() {
	vec4 k = texelFetch( tInk, ivec2( gl_FragCoord.xy ), 0 );
	float a = k.r, occ = k.g;
	float alpha = 1.0 - ( 1.0 - occ ) * ( 1.0 - a );
	if ( alpha <= 0.003 ) discard;
	gl_FragColor = vec4( linearToOutputTexel( vec4( uColour, 1.0 ) ).rgb * a, alpha );
}`;

/**
 * The outline pass. Options: { THREE, renderer, enabled }. Returns:
 *  - composite: the full-screen mesh to add to the main scene (it is drawn only while a frame has outline data);
 *  - register(mesh, { group, mirror }): give a body mesh its code (the batch instance follows the mesh every frame);
 *  - setGroup(mesh, group): change a registered mesh's limb group (a rig arrived later);
 *  - setSize(cssW, cssH, pixelRatio): the drawing buffer (the targets are re-allocated only when it changes);
 *  - setQuality(level): the QUALITY_LEVELS index (the supersampling of the lines, OUTLINE_AA);
 *  - render(scene, camera): the ID, edge and ink passes for the frame about to be drawn (call right before
 *    renderer.render(scene));
 *  - invalidate(): redraw the passes next frame (context restored); setEnabled(on), setOcclusion(on), state(), dispose().
 *
 * The ID pass is ONE draw (THREE.BatchedMesh, WEBGL_multi_draw where the browser has it) instead of one per mesh: the
 * batch holds a position-only copy of each body geometry (a muscle and its mirror twin share one copy), every source
 * mesh is an instance with its world matrix, visibility and code. Each frame only what changed is written: matrices
 * that moved, visibility that changed, the positions of geometry the game re-skinned (attribute version), a new
 * geometry (a LOD copy) added in free space or, when the batch is full, a rebuild. When nothing changed (camera, matrices,
 * visibility, geometry, buffer) the previous frame's targets are still right and the passes are skipped.
 */
export function createOutlinePass({ THREE, renderer, enabled = true } = {}) {
  if (!THREE || !renderer) throw new Error('createOutlinePass needs THREE and a renderer');
  const ok = typeof THREE.WebGLRenderTarget === 'function' && typeof THREE.DepthTexture === 'function' && typeof THREE.ShaderMaterial === 'function' &&
    typeof THREE.BatchedMesh === 'function' && renderer.capabilities && renderer.capabilities.isWebGL2 !== false;
  const idScene = new THREE.Scene();
  idScene.name = 'ns-outline ID pass (one batch of the drawn body meshes)';
  idScene.matrixWorldAutoUpdate = false;
  const idMat = new THREE.ShaderMaterial({ vertexShader: ID_VS, fragmentShader: ID_FS, side: THREE.DoubleSide, depthTest: true, depthWrite: true, blending: THREE.NoBlending, toneMapped: false, fog: false });
  const depthTexture = ok ? new THREE.DepthTexture(1, 1) : null;
  if (depthTexture) { depthTexture.minFilter = THREE.NearestFilter; depthTexture.magFilter = THREE.NearestFilter; }
  const nearestTarget = extra => new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, stencilBuffer: false, ...extra });
  // The supersampled ID target (with its depth), the supersampled edge classes and the screen-size ink.
  const target = ok ? nearestTarget({ depthBuffer: true, depthTexture }) : null;
  const edgeTarget = ok ? nearestTarget({ depthBuffer: false }) : null;
  const inkTarget = ok ? nearestTarget({ depthBuffer: false }) : null;
  // R558 BB: the motor strip's coverage where it is in front of the bodies (the ID pass's depth, tested, not written).
  const stripTarget = ok ? nearestTarget({ depthBuffer: true, depthTexture }) : null;
  const adjSize = 32;
  const adjTex = new THREE.DataTexture(outlineAdjacency(adjSize), adjSize, adjSize, THREE.RedFormat, THREE.UnsignedByteType);
  adjTex.minFilter = THREE.NearestFilter; adjTex.magFilter = THREE.NearestFilter; adjTex.generateMipmaps = false; adjTex.needsUpdate = true;
  const shared = {
    tId: { value: target ? target.texture : null }, tDepth: { value: depthTexture },
    uView: { value: new THREE.Vector4(1, 0.01, 100, 1) }, uSize: { value: [1, 1] }
  };
  const stripOn = { value: 0 };
  const edgeUni = {
    ...shared, tAdj: { value: adjTex }, tStrip: { value: stripTarget ? stripTarget.texture : null }, uStripOn: stripOn,
    uJump: { value: new THREE.Vector4(OUTLINE.jumpAdjM, OUTLINE.jumpSameM, OUTLINE.jumpRel, OUTLINE.levelM) },
    uHole: { value: 2 }
  };
  const inkUni = {
    ...shared, tEdge: { value: edgeTarget ? edgeTarget.texture : null }, uSS: { value: 1 },
    tStrip: edgeUni.tStrip, uStrip: { value: new THREE.Vector4(OUTLINE.stripCss, OUTLINE.stripAlpha, 0, 0) },
    uWidth: { value: new THREE.Vector4(OUTLINE.boldCss, OUTLINE.innerCss, OUTLINE.fineCss, 1) },
    uAlpha: { value: new THREE.Vector4(OUTLINE.strong, OUTLINE.silhouette, OUTLINE.inner, OUTLINE.faint) },
    uTaper: { value: new THREE.Vector4(4.5, OUTLINE.taperFullPxCm, OUTLINE.taperMin, OUTLINE.maxRadiusSs) },
    uDetail: { value: new THREE.Vector2(OUTLINE.detailFromPxCm, OUTLINE.detailFullPxCm) },
    uAo: { value: new THREE.Vector4(0, OUTLINE_AO.radiusM, OUTLINE_AO.bias, OUTLINE_AO.maxRadiusPx) },
    uProj: { value: new THREE.Vector2(1, 1) },
    uThin: { value: new THREE.Vector3(OUTLINE.thinShare, OUTLINE.thinFrom, OUTLINE.thinFull) }
  };
  const screenMat = (fs, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: SCREEN_VS, fragmentShader: fs, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false, fog: false });
  const edgeMat = screenMat(EDGE_FS, edgeUni), inkMat = screenMat(INK_FS, inkUni);
  const compUni = { tInk: { value: inkTarget ? inkTarget.texture : null }, uColour: { value: new THREE.Color().setRGB(...OUTLINE.colour, THREE.SRGBColorSpace) } };
  const compMat = new THREE.ShaderMaterial({
    uniforms: { tInk: compUni.tInk, uColour: { value: new THREE.Vector3(compUni.uColour.value.r, compUni.uColour.value.g, compUni.uColour.value.b) } },
    vertexShader: SCREEN_VS, fragmentShader: COMPOSITE_FS, transparent: true, premultipliedAlpha: true,
    blending: THREE.NormalBlending, depthTest: false, depthWrite: false, toneMapped: false, fog: false
  });
  const quadGeo = new THREE.BufferGeometry();
  quadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const screenMesh = (mat, name) => { const m = new THREE.Mesh(quadGeo, mat); m.name = name; m.frustumCulled = false; m.matrixAutoUpdate = false; m.raycast = () => {}; return m; };
  const edgeScene = new THREE.Scene(), inkScene = new THREE.Scene();
  edgeScene.matrixWorldAutoUpdate = false; inkScene.matrixWorldAutoUpdate = false;
  edgeScene.add(screenMesh(edgeMat, 'ns-outline edge pass')); inkScene.add(screenMesh(inkMat, 'ns-outline ink pass'));
  const composite = screenMesh(compMat, 'ns-outline composite (screen-space ink lines of the bodies; display only)');
  composite.renderOrder = OUTLINE.renderOrder;
  composite.visible = false;
  // R558 BB: the strip's silhouette (the sulci that bound it, seen from above) drawn right after the motor areas.
  const stripCompMat = new THREE.ShaderMaterial({
    uniforms: { tInk: compMat.uniforms.tInk, uColour: compMat.uniforms.uColour }, vertexShader: SCREEN_VS, fragmentShader: STRIP_COMPOSITE_FS,
    transparent: true, premultipliedAlpha: true, blending: THREE.NormalBlending, depthTest: false, depthWrite: false, toneMapped: false, fog: false
  });
  const stripComposite = screenMesh(stripCompMat, 'ns-outline strip composite (ink silhouette of the motor strip; display only)');
  stripComposite.visible = false;
  const stripScene = new THREE.Scene();
  stripScene.matrixWorldAutoUpdate = false;
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: true, depthWrite: false, toneMapped: false, fog: false });
  const strip = { mesh: null, source: null, m: new Float64Array(16).fill(NaN), shown: false };

  const reg = [];            // { src, group, mirror, serial, iid, gid, show, flip, dbl, m: Float64Array(16) }
  const bySource = new Map();
  const geoms = new Map();   // source geometry -> { gid, pos, posV, n, idx, idxV, ni, vStart, vRes, iRes }
  let batch = null, rebuild = true, force = true, serial = 0;
  let headroom = 1.15, overflow = false; // batch space: 15 % spare; each time it overflows (LOD copies arriving) +40 %, at most 2x
  let on = enabled !== false && ok;
  let occOn = false;
  let bufW = 0, bufH = 0, pr = 1, ss = 1, level = 0, ssW = 0, ssH = 0;
  const maxTexture = renderer.capabilities && Number.isFinite(renderer.capabilities.maxTextureSize) ? renderer.capabilities.maxTextureSize : 4096;
  const camKey = new Float64Array(32);
  const stats = { sources: 0, drawn: 0, draws: 0, ms: 0, frames: 0, skipped: 0, rebuilds: 0, vertexCapacity: 0, indexCapacity: 0, geometries: 0, copiedVertices: 0 };
  const saveColour = new THREE.Color(), tmpColour = new THREE.Color();
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const colourOf = r => {
    const g = r.group + (r.mirror ? OUTLINE_MIRROR_OFFSET : 0), n = r.serial;
    const hi = ((n >> 8) & 63) | (r.flip ? 128 : 0) | (r.dbl ? 64 : 0);
    return tmpColour.setRGB(g / 255, hi / 255, (n & 255) / 255);
  };
  function register(mesh, { group = OUTLINE_GROUPS.trunk, mirror = false } = {}) {
    if (!mesh || !mesh.isMesh || bySource.has(mesh)) return null;
    serial = serial >= 16383 ? 1 : serial + 1;
    const r = { src: mesh, group: group | 0, mirror: mirror === true, serial, iid: -1, gid: -1, show: false, flip: false, dbl: false, m: new Float64Array(16) };
    reg.push(r);
    bySource.set(mesh, r);
    stats.sources = reg.length;
    rebuild = true;
    return r;
  }
  function setGroup(mesh, group) {
    const r = bySource.get(mesh);
    if (!r || !(group > 0)) return false;
    if (r.group !== group) { r.group = group | 0; if (batch && r.iid >= 0) { batch.setColorAt(r.iid, colourOf(r)); force = true; } }
    return true;
  }
  const bufSize = new THREE.Vector2();
  /** Re-size the three targets to the drawing buffer (ink) and ss times it (ID, edges) when either changed. */
  function sizeTargets() {
    const k = outlineSsFactor(level, bufW, bufH, maxTexture);
    const w = bufW * k, h = bufH * k;
    if (target && (k !== ss || w !== ssW || h !== ssH)) { target.setSize(w, h); edgeTarget.setSize(w, h); stripTarget.setSize(w, h); ss = k; ssW = w; ssH = h; force = true; }
    if (inkTarget && (inkTarget.width !== bufW || inkTarget.height !== bufH)) { inkTarget.setSize(bufW, bufH); force = true; }
    shared.uSize.value = [ssW, ssH];
    inkUni.uSS.value = ss;
  }
  function setSize(cssW, cssH, pixelRatio) {
    pr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
    // The ink target must have exactly the drawing buffer's pixels (the composite reads it at gl_FragCoord).
    const b = typeof renderer.getDrawingBufferSize === 'function' ? renderer.getDrawingBufferSize(bufSize) : null;
    const w = Math.max(1, b ? b.x : Math.floor(cssW * pr)), h = Math.max(1, b ? b.y : Math.floor(cssH * pr));
    if (w !== bufW || h !== bufH) { bufW = w; bufH = h; }
    sizeTargets();
  }
  /** The QUALITY_LEVELS index: the supersampling of the lines follows it (OUTLINE_AA). */
  function setQuality(lv) {
    const v = Number.isInteger(lv) && lv >= 0 ? lv : 0;
    if (v !== level) { level = v; if (bufW > 0 && bufH > 0) sizeTargets(); }
    return ss;
  }
  const positionOnly = g => {
    const w = new THREE.BufferGeometry();
    w.setAttribute('position', g.attributes.position);
    w.setIndex(g.index);
    return w;
  };
  const usable = g => Boolean(g && g.index && g.attributes && g.attributes.position && g.attributes.position.itemSize === 3 && !g.attributes.position.isInterleavedBufferAttribute);
  function addGeom(g) {
    if (!batch || !usable(g)) return null;
    const pos = g.attributes.position, idx = g.index;
    if (batch.unusedVertexCount < pos.count || batch.unusedIndexCount < idx.count) return null;
    let gid;
    try { gid = batch.addGeometry(positionOnly(g)); } catch { return null; }
    const info = batch._geometryInfo && batch._geometryInfo[gid];
    const e = { gid, pos, posV: pos.version, n: pos.count, idx, idxV: idx.version, ni: idx.count, vStart: info ? info.vertexStart : -1, vRes: pos.count, iRes: idx.count };
    geoms.set(g, e);
    stats.geometries = geoms.size;
    return e;
  }
  function build() {
    const t0 = now();
    rebuild = false; force = true;
    if (overflow) { headroom = Math.min(2, headroom + 0.4); overflow = false; }
    if (batch) { idScene.remove(batch); batch.dispose(); batch = null; }
    geoms.clear();
    const set = new Set();
    for (const r of reg) if (usable(r.src.geometry)) set.add(r.src.geometry);
    let V = 0, I = 0;
    for (const g of set) { V += g.attributes.position.count; I += g.index.count; }
    if (!reg.length || !V) return;
    // A little head room (a geometry rebuilt larger, a few more meshes) keeps the GPU memory small; a quality change that
    // swaps in the LOD copies (some arrive over several frames) overflows it, and each overflow rebuilds once with more.
    V = Math.ceil(V * headroom) + 4096; I = Math.ceil(I * headroom) + 12288;
    batch = new THREE.BatchedMesh(reg.length + 8, V, I, idMat);
    batch.name = 'ns-outline ID batch';
    batch.perObjectFrustumCulled = false; // the GPU clips; per-instance bounds of re-skinned muscles would go stale
    batch.sortObjects = false;
    batch.frustumCulled = false;
    batch.matrixAutoUpdate = false;
    batch.matrixWorldAutoUpdate = false;
    for (const g of set) addGeom(g);
    for (const r of reg) {
      const e = geoms.get(r.src.geometry);
      r.gid = e ? e.gid : -1;
      r.iid = e ? batch.addInstance(e.gid) : -1;
      r.show = true; r.m.fill(NaN);
      if (r.iid >= 0) { batch.setColorAt(r.iid, colourOf(r)); batch.setVisibleAt(r.iid, false); r.show = false; }
    }
    idScene.add(batch);
    stats.rebuilds++;
    stats.vertexCapacity = V; stats.indexCapacity = I;
    stats.rebuildMs = now() - t0;
  }
  /** True when every ancestor up to the scene is visible (memoised per frame). */
  const chain = new Map();
  function drawnChain(o, root) {
    let n = o.parent;
    const seen = [];
    let vis = true;
    while (n) {
      if (chain.has(n)) { vis = chain.get(n); break; }
      seen.push(n);
      if (n.visible === false) { vis = false; break; }
      if (n === root) break;
      if (!n.parent) { vis = false; break; } // not attached to the drawn scene
      n = n.parent;
    }
    for (const s of seen) chain.set(s, vis);
    return vis;
  }
  /** Bring the batch up to date with the sources; returns true when anything the ID target shows may have changed. */
  function sync(scene) {
    let changed = false;
    chain.clear();
    let drawn = 0, copied = 0;
    const done = new Set();
    for (const r of reg) {
      if (r.iid < 0) { if (r.src.visible) rebuild = true; continue; }
      const s = r.src, m = s.material, g = s.geometry;
      let show = s.visible === true && m && !Array.isArray(m) && m.visible !== false && m.transparent !== true && m.colorWrite !== false &&
        m.depthWrite !== false && usable(g) && drawnChain(s, scene);
      if (show) {
        let e = geoms.get(g);
        if (e && (e.pos !== g.attributes.position || e.idx !== g.index || e.n !== g.attributes.position.count || e.ni !== g.index.count || e.idxV !== g.index.version)) {
          // The geometry was rebuilt in place: rewrite it (same reserved space) or give it new space.
          if (g.attributes.position.count <= e.vRes && g.index.count <= e.iRes) {
            try {
              batch.setGeometryAt(e.gid, positionOnly(g));
              Object.assign(e, { pos: g.attributes.position, posV: g.attributes.position.version, n: g.attributes.position.count, idx: g.index, idxV: g.index.version, ni: g.index.count });
              copied += e.n;
            } catch { e = null; }
          } else { geoms.delete(g); e = null; }
          changed = true;
        }
        if (!e) { e = addGeom(g); changed = true; if (!e) { rebuild = true; overflow = true; show = false; } }
        if (e && !done.has(e) && e.posV !== e.pos.version) {
          // Re-skinned in place (CPU skinning, the lift): copy the new positions into the batch's block.
          const dst = batch.geometry.attributes.position, n3 = e.n * 3;
          if (e.vStart >= 0 && e.pos.array.length >= n3) {
            dst.array.set(e.pos.array.subarray(0, n3), e.vStart * 3);
            dst.addUpdateRange(e.vStart * 3, n3);
            dst.needsUpdate = true;
          } else batch.setGeometryAt(e.gid, positionOnly(g));
          e.posV = e.pos.version;
          copied += e.n;
          changed = true;
        }
        if (e) {
          done.add(e);
          if (r.gid !== e.gid) { batch.setGeometryIdAt(r.iid, e.gid); r.gid = e.gid; batch._visibilityChanged = true; changed = true; }
          const w = s.matrixWorld.elements, k = r.m;
          let moved = false;
          for (let i = 0; i < 16; i++) if (k[i] !== w[i]) { moved = true; break; }
          if (moved) {
            for (let i = 0; i < 16; i++) k[i] = w[i];
            batch.setMatrixAt(r.iid, s.matrixWorld);
            const flip = s.matrixWorld.determinant() < 0, dbl = m.side === THREE.DoubleSide;
            if (flip !== r.flip || dbl !== r.dbl) { r.flip = flip; r.dbl = dbl; batch.setColorAt(r.iid, colourOf(r)); }
            changed = true;
          }
          const dbl = m.side === THREE.DoubleSide;
          if (dbl !== r.dbl) { r.dbl = dbl; batch.setColorAt(r.iid, colourOf(r)); changed = true; }
        }
      }
      if (show !== r.show) { r.show = show; batch.setVisibleAt(r.iid, show); changed = true; }
      if (show) drawn++;
    }
    stats.drawn = drawn;
    stats.copiedVertices = copied;
    return changed;
  }
  /** The ID pass for the frame about to be drawn. Returns true when the composite will draw. */
  const passTo = (rt, sceneIn, camera) => {
    renderer.setRenderTarget(rt);
    renderer.render(sceneIn, camera);
  };
  /** The ID, edge and ink passes for the frame about to be drawn. Returns true when the composite will draw. */
  function render(scene, camera) {
    if (!on || !target || bufW < 2 || bufH < 2 || !reg.length) { composite.visible = false; return false; }
    const t0 = now();
    if (scene.matrixWorldAutoUpdate !== false) scene.updateMatrixWorld();
    if (rebuild) build();
    if (!batch) { composite.visible = false; return false; }
    let changed = sync(scene);
    if (rebuild) { build(); changed = sync(scene) || true; }
    // The camera: view and projection.
    const a = camera.matrixWorldInverse.elements, b = camera.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) {
      if (camKey[i] !== a[i]) { camKey[i] = a[i]; changed = true; }
      if (camKey[16 + i] !== b[i]) { camKey[16 + i] = b[i]; changed = true; }
    }
    // The strip: its world matrix (the brain group's) and whether it is drawn.
    if (strip.mesh) {
      const src = strip.source, show = Boolean(src && src.visible !== false && drawnChain(src, scene) !== false && src.parent);
      if (show !== strip.shown) { strip.shown = show; changed = true; }
      if (show) {
        const w = src.matrixWorld.elements, k = strip.m;
        let moved = false;
        for (let i = 0; i < 16; i++) if (k[i] !== w[i]) { moved = true; k[i] = w[i]; }
        if (moved) { strip.mesh.matrixWorld.copy(src.matrixWorld); changed = true; }
      }
    }
    stripOn.value = strip.mesh && strip.shown ? 1 : 0;
    inkUni.uStrip.value.z = stripOn.value;
    if (stats.drawn === 0 && !stripOn.value) { composite.visible = false; stripComposite.visible = false; stats.ms = now() - t0; return false; }
    // Uniforms of the edge and ink passes (cheap; set every frame so a skipped frame keeps them right).
    shared.uView.value.set(1, camera.near, camera.far, camera.isOrthographicCamera ? 0 : 1);
    const P = camera.projectionMatrix.elements;
    inkUni.uProj.value.set(P[0], P[5]);
    inkUni.uWidth.value.w = pr * ss;
    const hole = Math.max(2, Math.min(8, Math.round(OUTLINE.holeCss * pr * ss)));
    if (edgeUni.uHole.value !== hole) { edgeUni.uHole.value = hole; changed = true; }
    inkUni.uAo.value.x = occOn ? OUTLINE_AO.strength : 0;
    inkUni.uAo.value.w = OUTLINE_AO.maxRadiusPx * Math.max(0.25, pr) * ss;
    // CSS pixels per centimetre at 1 m (perspective): the taper and the detail fade do not change with the buffer scale.
    const fov = Number.isFinite(camera.fov) ? camera.fov : 90;
    const pxcm = (bufH / pr) / (2 * Math.tan((fov * Math.PI) / 360)) / 100;
    if (inkUni.uTaper.value.x !== pxcm) { inkUni.uTaper.value.x = pxcm; changed = true; }
    if (changed || force || !composite.visible) {
      const prevTarget = renderer.getRenderTarget(), prevAlpha = renderer.getClearAlpha(), prevAuto = renderer.autoClear;
      renderer.getClearColor(saveColour);
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      passTo(target, idScene, camera);
      const info = renderer.info && renderer.info.render;
      stats.draws = info ? info.calls : 0;
      if (stripOn.value) {
        // colour cleared, the ID pass's depth kept: the strip is marked only where it is in front of every body
        renderer.setRenderTarget(stripTarget);
        renderer.clear(true, false, false);
        renderer.autoClear = false;
        renderer.render(stripScene, camera);
        renderer.autoClear = true;
      }
      passTo(edgeTarget, edgeScene, camera);
      passTo(inkTarget, inkScene, camera);
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(saveColour, prevAlpha);
      renderer.autoClear = prevAuto;
      force = false;
      stats.frames++;
    } else stats.skipped++;
    composite.visible = stats.drawn > 0;
    stripComposite.visible = stripOn.value > 0;
    stats.ms = now() - t0;
    return true;
  }
  /** The motor strip for its silhouette ink: one geometry in the local frame of `source` (an Object3D whose world matrix
   * and visibility it follows: the brain group). null removes it. */
  function setStrip(geometry, source) {
    if (strip.mesh) { stripScene.remove(strip.mesh); strip.mesh = null; }
    strip.source = null; strip.shown = false; strip.m.fill(NaN);
    if (geometry && geometry.attributes && geometry.attributes.position && source && source.matrixWorld) {
      const m = new THREE.Mesh(geometry, stripMat);
      m.name = 'ns-outline strip coverage'; m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.frustumCulled = false;
      stripScene.add(m);
      strip.mesh = m; strip.source = source;
    }
    force = true;
    return Boolean(strip.mesh);
  }
  function invalidate() { force = true; }
  /** Depth shading (OUTLINE_AO) on or off; the scene turns it on only at the full quality level. */
  function setOcclusion(v) { const n = v === true; if (n !== occOn) force = true; occOn = n; return occOn; }
  function setEnabled(v) {
    on = v !== false && ok;
    if (!on) composite.visible = false;
    force = true;
    return on;
  }
  function state() {
    return { supported: ok, enabled: on, occlusion: occOn, sources: stats.sources, drawn: stats.drawn, idDraws: stats.draws, cpuMs: Math.round(stats.ms * 100) / 100,
      idFrames: stats.frames, skippedFrames: stats.skipped, rebuilds: stats.rebuilds, lastRebuildMs: Math.round((stats.rebuildMs || 0) * 10) / 10, geometries: stats.geometries,
      vertexCapacity: stats.vertexCapacity, indexCapacity: stats.indexCapacity, copiedVertices: stats.copiedVertices,
      multiDraw: Boolean(renderer.extensions && typeof renderer.extensions.has === 'function' && renderer.extensions.has('WEBGL_multi_draw')),
      buffer: [bufW, bufH], supersample: ss, idTarget: [ssW, ssH], widthPx: Math.round(outlineWidthPx(pr) * 1000) / 1000,
      strip: Boolean(strip.mesh), stripShown: strip.shown };
  }
  function dispose() {
    if (batch) { batch.dispose(); batch = null; }
    for (const t of [target, edgeTarget, inkTarget, stripTarget]) if (t) t.dispose();
    stripMat.dispose(); stripCompMat.dispose(); if (strip.mesh && strip.mesh.geometry) strip.mesh.geometry.dispose();
    if (depthTexture) depthTexture.dispose();
    adjTex.dispose(); quadGeo.dispose(); compMat.dispose(); idMat.dispose(); edgeMat.dispose(); inkMat.dispose();
    reg.length = 0; bySource.clear(); geoms.clear();
  }
  return { composite, stripComposite, setStrip, register, setGroup, setSize, setQuality, render, invalidate, setEnabled, setOcclusion, state, dispose, get enabled() { return on; }, get supersample() { return ss; } };
}
