/** NeuroSurge: a limb hidden behind another limb stays visible and can be aimed at (18 November 2026).
 *
 * The owner, 17 November: "fix it when limbs become invisible because they're blocked behind other limbs"; "often limbs
 * become out of view and you can't control them anymore". 18 November: "make sure limbs can't be ... locked away or
 * occluded in inaccessible places". 11 November: "If limbs are overlapping, make sure their clearly defined with
 * outlines so they don't merge into each other" and "No invisible or transparent body parts".
 *
 * What it does. Where one of the four limbs (an arm or a leg) is covered by ANOTHER limb or by the trunk of the same
 * body, the covered part is drawn over the part in front as a GHOST: a clear line round the hidden part in the limb's
 * own colour (its family on the motor strip: blue left arm, orange right arm, purple left leg, yellow right leg), with a
 * thin dark keyline inside it, and a soft translucent fill of that colour: light, or stronger when the limb is LOCKED
 * AWAY (hidden and hardly seen anywhere in the picture: a leg behind the other thigh, an arm under the body). Nothing in
 * front becomes see-through: the ghost is only added on top. A hidden sliver narrower than SEE.minWidthCm gets nothing.
 *
 * Which part is a ghost (per LIMB, not per muscle; the same rule on the graphics card and in the picking):
 *  - only the limbs get ghosts (not the trunk, neck or head); a limb never ghosts through itself (the fingers in front
 *    of their own palm, a forearm folded on its upper arm);
 *  - the trunk and head count as one piece: the chest in front of the belly is nothing;
 *  - a part joined at a joint to the part in front (the thigh or upper arm going into the trunk at the hip or the
 *    shoulder) is not a hidden part either: a limb's root always disappears into the trunk;
 *  - the hidden part must lie at least SEE.gapM (plus SEE.gapRel of the distance) behind the part in front;
 *  - only within one body: your limb behind the mirror body, or the mirror body behind your legs, gets no ghost (each is
 *    an item you can move away, and Shift reaches the one behind);
 *  - nothing ghosts through the brain (the brain is not a body here; you can carry it away; Shift reaches past it).
 * Everything else behind the front part (the trunk, a joined root) is passed through: a hand pushed under the body shows
 * through the thigh AND the pelvis in front of it (first tried: the first thing behind decides; an arm under the body then
 * showed as scattered blobs, because the pelvis lay between the thigh and the arm in most places).
 *
 * Which part the crosshair takes: the ghost of a LOCKED-AWAY limb (drawn filled) wins; elsewhere (the limb shows itself
 * elsewhere in the picture, so it can be aimed at there: two forearms crossing, a thigh round a hand lying on it) the part
 * in front is taken and Shift reaches the hidden limb (and, while Shift is held, the tip names it and a line goes round
 * all of that limb).
 *
 * Cost: one extra draw of the outline pass's batch (one multi-draw, geometry only, the ID pass's own instances) into a
 * target of the ID pass's size, only on the frames where the outline pass redraws (the camera or a body moved); an
 * occlusion query on it says whether anything is covered at all, and only then do the small screen pass (lines and fill),
 * the census (a 48 x 27 grid) and its small read-back (never waited for) and the composite (one texel per pixel) run.
 *
 * Display only: a drawing aid and a picking aid. It changes no pose, activity value or collision.
 */
import * as NsColors from './ns-colors.mjs';
import { OUTLINE, OUTLINE_GROUPS, OUTLINE_ADJACENT, OUTLINE_MIRROR_OFFSET, OUTLINE_ID_VS, OUTLINE_SKIN_ID_VS, OUTLINE_SKIN_BATCH_VS } from './ns-outline.mjs';

/** Display and picking choices (18 November 2026).
 *  gapM / gapRel: how far behind the front part (metres, plus a share of its distance) a part must lie to be hidden.
 *  lineCss: the ghost line's width (CSS px, on a near body; tapered like the outline's lines). lineAlpha: its opacity.
 *  LOCKED AWAY (per limb, from the census: a grid of censusCells cells across the picture, each noting which limbs are
 *  seen and which hidden in it): a limb hidden in at least lockCells cells whose seen share (seen / (seen + hidden) cells)
 *  is under lockOn; it stays locked until the share rises over lockOff (no flicker near the threshold). Its ghost is
 *  filled at fillAlpha and the crosshair takes it; every other ghost gets the light fillLow and leaves the part in front
 *  to the crosshair (Shift reaches it). The fill strength eases over fillEaseS (at once under reduced motion).
 *  (First tried, per pixel: fill where the hidden part looked "closed" within 9 to 13 cm round the pixel. The fill came
 *  out patchy: a jagged diamond-shaped hole in the middle of a leg hidden behind the other thigh, `under-fix.png`, and a
 *  forearm across the edge of a thigh filled the thigh's strip, `ar-2.png`. A limb's visibility is a property of the
 *  whole limb, so it is now decided per limb.)
 *  minWidthCm: a hidden part narrower than this (its narrowest width through the pixel, in the world) gets no ghost: a
 *  finger tip or a tendon tucked behind a thigh is noise, the limb shows beside it. focusCss: the line round the limb
 *  that Shift would take (while Shift is held).
 *  colourLift: the limb colours are its strip family's mean glow colour scaled so the largest channel is this (kept
 *  under the bloom's threshold so the ghost does not glow), then moved colourWhite of the way to white of that level (a
 *  deep blue or purple line on red muscle was too dark to read); the fill fillWhite of the way. keyCss / keyAlpha: a thin
 *  dark band just inside the coloured line (the outline's ink colour), so the line holds on muscle of a like colour (the
 *  orange right arm on red muscle hardly read without it). */
export const SEE = Object.freeze({
  gapM: 0.012, gapRel: 0.01,
  lineCss: 2.0, lineAlpha: 1, keyCss: 1.0, keyAlpha: 0.55,
  fillAlpha: 0.42, fillLow: 0.16, fillEaseS: 0.15, minWidthCm: 3,
  censusCells: 48, lockCells: 2, lockOn: 0.35, lockOff: 0.5,
  focusCss: 3.0,
  colourLift: 0.8, colourWhite: 0.12, fillWhite: 0.4
});

/** The four limbs in their ghost code order (1..4 your body, 5..8 the mirror body; 0 = not a limb). */
export const SEE_LIMBS = Object.freeze(['leftArm', 'rightArm', 'leftLeg', 'rightLeg']);
const G = OUTLINE_GROUPS;
const LIMB_OF_GROUP = (() => {
  const t = new Uint8Array(OUTLINE_MIRROR_OFFSET);
  for (const k of ['lUpper', 'lFore', 'lHand']) t[G[k]] = 1;
  for (const k of ['rUpper', 'rFore', 'rHand']) t[G[k]] = 2;
  for (const k of ['lThigh', 'lShank', 'lFoot']) t[G[k]] = 3;
  for (const k of ['rThigh', 'rShank', 'rFoot']) t[G[k]] = 4;
  return t;
})();
const ADJ = new Set(OUTLINE_ADJACENT.map(([a, b]) => `${Math.min(G[a], G[b])}:${Math.max(G[a], G[b])}`));

/** The ghost code of an outline group (ns-outline groupOf: 1..14 your body, 17..30 the mirror body): 1..4 your left arm,
 * right arm, left leg, right leg; 5..8 the same on the mirror body; 0 for the trunk, the head and anything unknown. */
export function seeLimbOfGroup(group) {
  const g = Number.isInteger(group) ? group : -1;
  if (g <= 0 || g >= 2 * OUTLINE_MIRROR_OFFSET) return 0;
  const m = g >= OUTLINE_MIRROR_OFFSET, k = m ? g - OUTLINE_MIRROR_OFFSET : g;
  const l = LIMB_OF_GROUP[k] || 0;
  return l ? l + (m ? 4 : 0) : 0;
}
/** { limb ('leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'), source ('own' | 'mirror') } of a ghost code, or null. */
export function seeLimbKey(code) {
  if (!Number.isInteger(code) || code < 1 || code > 8) return null;
  return { limb: SEE_LIMBS[(code - 1) % 4], source: code > 4 ? 'mirror' : 'own' };
}
const bodyOfGroup = g => (g >= OUTLINE_MIRROR_OFFSET ? 2 : g > 0 ? 1 : 0);
/** Whether a part of outline group `behind`, lying behind a part of group `front` (by more than the gap), is a ghost:
 * the same body, another piece (the trunk and head are one), a limb, not joined to the front part at a joint. */
export function seeGhostEligible(front, behind) {
  if (!(Number.isInteger(front) && Number.isInteger(behind)) || front <= 0 || behind <= 0) return false;
  if (bodyOfGroup(front) !== bodyOfGroup(behind)) return false;
  const lf = seeLimbOfGroup(front), lb = seeLimbOfGroup(behind);
  if (lb === 0 || lb === lf) return false;
  const off = front >= OUTLINE_MIRROR_OFFSET ? OUTLINE_MIRROR_OFFSET : 0;
  const a = front - off, b = behind - off;
  return !ADJ.has(`${Math.min(a, b)}:${Math.max(a, b)}`);
}
/** The hidden limb on a ray (pure; the same rule as the ghost pass): `layers` as the scene's controlLayersAt gives them
 * (nearest first; body entries { item: 'own' | 'mirror', distance, rec: { group } }, brain entries are passed over). The
 * front is the first body entry; behind it, the first entry of the same body that lies beyond the gap and is a ghost
 * against the front (seeGhostEligible), or null. */
export function seeHiddenEntry(layers, o = SEE) {
  if (!Array.isArray(layers)) return null;
  const body = l => l && (l.item === 'own' || l.item === 'mirror') && Number.isFinite(l.distance) && l.rec && Number.isInteger(l.rec.group) && l.rec.group > 0;
  let front = null;
  for (const l of layers) {
    if (!body(l)) continue;
    if (!front) { front = l; continue; }
    if (l.item !== front.item) continue;
    if (l.distance < front.distance + o.gapM + o.gapRel * front.distance) continue;
    if (seeGhostEligible(front.rec.group, l.rec.group)) return l;
  }
  return null;
}
/** Whether the crosshair takes the hidden entry (pure): its limb is locked away (`locked`: [9] booleans by ghost code,
 * the scene's census answer, as seeLockedAway gives it; its ghost is drawn filled). */
export function seeTakesGhost(locked, hidden) {
  if (!Array.isArray(locked) || !hidden || !hidden.rec) return false;
  const c = seeLimbOfGroup(hidden.rec.group);
  return c > 0 && locked[c] === true;
}
/** The ghost colours (linear RGB, 9 entries: index = ghost code, 0 unused): each limb's strip family's mean glow colour
 * (ns-colors AREA_FAMILIES / AREA_COLORS), scaled so its largest channel is SEE.colourLift; the mirror body the same. */
export function seeLimbColours(o = SEE, white = o.colourWhite) {
  const fam = key => {
    const f = Array.isArray(NsColors.AREA_FAMILIES) ? NsColors.AREA_FAMILIES.find(x => x && x.key === key) : null;
    const ids = f && Array.isArray(f.regions) ? f.regions : [];
    const s = [0, 0, 0]; let n = 0;
    for (const id of ids) { const c = typeof NsColors.areaGlowColor === 'function' ? NsColors.areaGlowColor(id) : null; if (c) { s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n++; } }
    if (!n) return [o.colourLift, o.colourLift, o.colourLift];
    const m = Math.max(s[0], s[1], s[2]) || 1;
    return s.map(v => ((v / m) * (1 - white) + white) * o.colourLift);
  };
  const four = SEE_LIMBS.map(fam);
  return [[0, 0, 0], ...four, ...four];
}

/* ---- the ghost pass (THREE injected; nothing here imports 'three') ------------------------------------------------- */
const GROUP_GLSL = `
int nsGroupOf( vec4 c ) { return int( c.r * 255.0 + 0.5 ); }
// ghost code of an outline group (seeLimbOfGroup): 1..4 your limbs, 5..8 the mirror body's, 0 trunk / head / none
int nsLimbOf( int g ) {
	int m = g >= ${OUTLINE_MIRROR_OFFSET} ? 4 : 0;
	int k = g >= ${OUTLINE_MIRROR_OFFSET} ? g - ${OUTLINE_MIRROR_OFFSET} : g;
	if ( k >= ${G.lUpper} && k <= ${G.lHand} ) return 1 + m;
	if ( k >= ${G.rUpper} && k <= ${G.rHand} ) return 2 + m;
	if ( k >= ${G.lThigh} && k <= ${G.lFoot} ) return 3 + m;
	if ( k >= ${G.rThigh} && k <= ${G.rFoot} ) return 4 + m;
	return 0;
}
int nsBodyOf( int g ) { return g >= ${OUTLINE_MIRROR_OFFSET} ? 2 : g > 0 ? 1 : 0; }
float nsViewDist( float d, vec4 view ) {
	if ( view.w > 0.5 ) return ( view.y * view.z ) / ( view.z - ( view.z - view.y ) * d );
	return view.y + d * ( view.z - view.y );
}`;
/* GHOST GEOMETRY PASS: the outline batch again (same instances), into a target of the ID target's size with its own depth.
 * Each fragment reads the ID picture (the front part) at its sample: only a ghost against the front (seeGhostEligible) that
 * lies behind it by the gap is kept; the nearest such fragment wins the depth test and writes its code. */
const GHOST_FS = `
precision highp float;
precision highp int;
flat varying vec3 vNsId;
uniform sampler2D tId;
uniform highp sampler2D tDepth;
uniform sampler2D tAdj;
uniform vec4 uView;
uniform vec2 uGap;
${GROUP_GLSL}
void main() {
	float gb = floor( vNsId.g * 255.0 + 0.5 );
	bool flip = gb >= 128.0;
	if ( flip ) gb -= 128.0;
	bool dbl = gb >= 64.0;
	if ( dbl ) gb -= 64.0;
	if ( ! dbl && gl_FrontFacing == flip ) discard;
	int g = int( vNsId.r * 255.0 + 0.5 );
	ivec2 p = ivec2( gl_FragCoord.xy );
	int gf = nsGroupOf( texelFetch( tId, p, 0 ) );
	if ( gf == 0 || nsBodyOf( g ) != nsBodyOf( gf ) ) discard;
	int lg = nsLimbOf( g ), lf = nsLimbOf( gf );
	if ( lg == 0 || lg == lf || texelFetch( tAdj, ivec2( gf, g ), 0 ).r > 0.5 ) discard;
	float zf = nsViewDist( texelFetch( tDepth, p, 0 ).r, uView );
	float z = nsViewDist( gl_FragCoord.z, uView );
	if ( z < zf + uGap.x + uGap.y * zf ) discard;
	gl_FragColor = vec4( float( lg ) / 255.0, 0.0, 0.0, 1.0 );
}`;
const SCREEN_VS = `
void main() {
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;
/* GHOST INK PASS (drawing-buffer pixels): per pixel, from its uSS x uSS samples of the ghost picture:
 *  r: the line's coverage (a sample within the line's width of the hidden part's own outline: where the next sample is
 *     not that ghost and does not show that limb itself in front), or of the FOCUS line (uFocus, a ghost code; 0 = none:
 *     a line round everything of that limb, seen or hidden), averaged over the samples;
 *  g: the ghost's coverage of the pixel, times `keep` (0 where the hidden part is a sliver narrower than uThin: its
 *     narrowest width through the pixel, from 8 walks out to where it stops);
 *  b: the ghost code; a: 0.5 + half the dark keyline's coverage (0.5 and above: something is written here).
 * The composite gives the fill its strength per limb (locked away or not: the census below). */
const INK_FS = `
precision highp float;
precision highp int;
uniform sampler2D tGhost;
uniform sampler2D tId;
uniform highp sampler2D tDepth;
uniform ivec2 uSize;
uniform int uSS;
uniform vec4 uView;
uniform vec4 uLine;   // x: line width (samples, at full size), y: focus line width (samples), z: samples per cm at 1 m, w: taper full (CSS px per cm)
uniform float uKey;   // the dark keyline's width inside the line (samples)
uniform float uTaperMin;
uniform float uCssPerSample;
uniform float uThin;   // the narrowest hidden part that gets a ghost (cm)
uniform int uFocus;
${GROUP_GLSL}
int ghostAt( ivec2 q ) { return int( texelFetch( tGhost, q, 0 ).r * 255.0 + 0.5 ); }
bool inside( ivec2 q ) { return q.x >= 0 && q.y >= 0 && q.x < uSize.x && q.y < uSize.y; }
// the hidden part's own outline at q: q is not this ghost and does not show this limb itself in front
bool rim( ivec2 q, int c ) {
	if ( ! inside( q ) ) return false;
	if ( ghostAt( q ) == c ) return false;
	return nsLimbOf( nsGroupOf( texelFetch( tId, q, 0 ) ) ) != c;
}
bool inFocus( ivec2 q ) {
	if ( ! inside( q ) ) return false;
	return ghostAt( q ) == uFocus || nsLimbOf( nsGroupOf( texelFetch( tId, q, 0 ) ) ) == uFocus;
}
ivec2 dirOf( int i ) {
	return i == 0 ? ivec2( 1, 0 ) : i == 1 ? ivec2( - 1, 0 ) : i == 2 ? ivec2( 0, 1 ) : i == 3 ? ivec2( 0, - 1 ) :
		i == 4 ? ivec2( 1, 1 ) : i == 5 ? ivec2( - 1, 1 ) : i == 6 ? ivec2( 1, - 1 ) : ivec2( - 1, - 1 );
}
void main() {
	ivec2 b = ivec2( gl_FragCoord.xy ) * uSS;
	int n = uSS * uSS;
	int code = 0; ivec2 s0 = b; int cnt = 0, fcnt = 0;
	float line = 0.0, fline = 0.0, key = 0.0, fkey = 0.0;
	float zNear = 1e9;
	for ( int i = 0; i < 4; i ++ ) {
		if ( i >= n ) break;
		ivec2 s = min( b + ivec2( i - 2 * ( i / 2 ), i / 2 ), uSize - 1 );
		int c = ghostAt( s );
		bool foc = uFocus > 0 && inFocus( s );
		if ( c == 0 && ! foc ) continue;
		float zi = nsViewDist( texelFetch( tDepth, s, 0 ).r, uView );
		if ( zi < zNear ) zNear = zi;
		// the widths taper with the on-screen size of a centimetre (as the outline's lines do)
		float taper = clamp( sqrt( uLine.z * uCssPerSample / max( zi, 1e-3 ) / uLine.w ), uTaperMin, 1.0 );
		for ( int pass = 0; pass < 2; pass ++ ) {
			bool ghost = pass == 0;
			if ( ghost ? c == 0 : ! foc ) continue;
			if ( ghost ) { cnt ++; if ( code == 0 ) { code = c; s0 = s; } } else fcnt ++;
			float w = ( ghost ? uLine.x : uLine.y ) * taper, d = 1e3;
			int reachSteps = int( ceil( w + uKey * taper ) ) + 1;
			for ( int k = 0; k < 8; k ++ ) {
				ivec2 o = dirOf( k );
				float len = k < 4 ? 1.0 : 1.41421356;
				for ( int j = 1; j <= 9; j ++ ) {
					if ( j > reachSteps ) break;
					ivec2 q = s + j * o;
					if ( ghost ) {
						if ( rim( q, c ) ) { d = min( d, float( j ) * len ); break; }
						if ( ghostAt( q ) != c ) break;
					} else {
						if ( ! inside( q ) ) break;
						if ( ! inFocus( q ) ) { d = min( d, float( j ) * len ); break; }
					}
				}
			}
			float lc = clamp( w + 0.5 - d, 0.0, 1.0 ), kc = clamp( w + uKey * taper + 0.5 - d, 0.0, 1.0 ) - lc;
			if ( ghost ) { line += lc; key += kc; } else { fline += lc; fkey += kc; }
		}
	}
	if ( cnt == 0 && fcnt == 0 ) discard;
	float keep = 1.0;
	if ( cnt > 0 ) {
		// The hidden part's narrowest width through this pixel (the four lines through it: across, up, the two slants), from
		// 8 walks out of the pixel's first ghost sample to where it stops being this ghost (stepping out by about half again
		// each time, then halving back three times onto the edge). A thin sliver (a finger tip or a tendon behind a thigh)
		// gets no ghost: it is noise, the limb shows beside it.
		float minW = uThin * uLine.z / max( zNear, 1e-3 );   // samples
		float reach = 1.4 * minW;
		float dk[ 8 ];
		for ( int k = 0; k < 8; k ++ ) {
			ivec2 o = dirOf( k );
			float len = k < 4 ? 1.0 : 1.41421356;
			float t0 = 0.0, t = 1.0, d = reach;
			for ( int j = 0; j < 12; j ++ ) {
				if ( t > reach ) break;
				ivec2 q = s0 + ivec2( round( vec2( o ) * ( t / len ) ) );
				if ( ! inside( q ) ) { d = t0; break; }
				if ( ghostAt( q ) != code ) {
					float a = t0, bb = t;
					for ( int r = 0; r < 3; r ++ ) {
						float m = 0.5 * ( a + bb );
						if ( ghostAt( s0 + ivec2( round( vec2( o ) * ( m / len ) ) ) ) == code ) a = m; else bb = m;
					}
					d = 0.5 * ( a + bb );
					break;
				}
				t0 = t; t = max( t + 1.0, t * 1.5 );
			}
			dk[ k ] = d;
		}
		float thick = min( min( dk[ 0 ] + dk[ 1 ], dk[ 2 ] + dk[ 3 ] ), min( dk[ 4 ] + dk[ 7 ], dk[ 5 ] + dk[ 6 ] ) );
		keep = smoothstep( 0.7 * minW, 1.3 * minW, thick );
	}
	float gl = line * keep, gk = max( key * keep, fkey );
	float fill = float( cnt ) / float( n ) * keep;
	if ( max( gl, fline ) <= 0.0 && fill <= 0.0 && gk <= 0.0 ) discard;
	int outCode = code != 0 ? code : uFocus;
	gl_FragColor = vec4( max( gl, fline ) / float( n ), fill, float( outCode ) / 255.0, 0.5 + 0.5 * gk / float( n ) );
}`;
/* CENSUS PASS (a small grid, one pixel per cell of the picture): which limbs are SEEN (front part) and which are HIDDEN
 * (ghost) somewhere in the cell, as two 8-bit masks (bit = ghost code - 1), from uGrid x uGrid samples of the cell. Read
 * back (small, never waited for), it says per limb how much of it shows: a limb hidden here and hardly seen anywhere is
 * locked away. */
const CENSUS_FS = `
precision highp float;
precision highp int;
uniform sampler2D tGhost;
uniform sampler2D tId;
uniform ivec2 uSize;
uniform ivec2 uCells;
uniform int uGrid;
${GROUP_GLSL}
void main() {
	ivec2 cell = ivec2( gl_FragCoord.xy );
	vec2 c0 = vec2( cell ) * vec2( uSize ) / vec2( uCells ), cs = vec2( uSize ) / vec2( uCells );
	int seen = 0, hidden = 0;
	for ( int y = 0; y < 8; y ++ ) {
		if ( y >= uGrid ) break;
		for ( int x = 0; x < 8; x ++ ) {
			if ( x >= uGrid ) break;
			ivec2 q = clamp( ivec2( c0 + ( vec2( x, y ) + 0.5 ) * cs / float( uGrid ) ), ivec2( 0 ), uSize - 1 );
			int l = nsLimbOf( nsGroupOf( texelFetch( tId, q, 0 ) ) );
			if ( l > 0 ) seen = seen | ( 1 << ( l - 1 ) );
			int g = int( texelFetch( tGhost, q, 0 ).r * 255.0 + 0.5 );
			if ( g > 0 && g <= 8 ) hidden = hidden | ( 1 << ( g - 1 ) );
		}
	}
	gl_FragColor = vec4( float( seen ) / 255.0, float( hidden ) / 255.0, 0.0, 1.0 );
}`;
/* COMPOSITE (main scene, right after the outline's ink): line over keyline over fill, in the code's colours, the fill at
 * that limb's strength (uFillA), premultiplied. */
const COMPOSITE_FS = `
precision highp float;
uniform sampler2D tInk;
uniform vec3 uCol[ 9 ];
uniform vec3 uFillCol[ 9 ];
uniform float uFillA[ 9 ];
uniform vec3 uKeyCol;
uniform vec2 uAlpha; // line, keyline
void main() {
	vec4 k = texelFetch( tInk, ivec2( gl_FragCoord.xy ), 0 );
	if ( k.a < 0.25 ) discard;
	int code = int( k.b * 255.0 + 0.5 );
	if ( code <= 0 || code > 8 ) discard;
	vec3 c = uCol[ 0 ], fc = uFillCol[ 0 ]; float fa = 0.0;
	for ( int i = 1; i <= 8; i ++ ) if ( i == code ) { c = uCol[ i ]; fc = uFillCol[ i ]; fa = uFillA[ i ]; }
	float l = k.r * uAlpha.x, f = k.g * fa, d = clamp( ( k.a - 0.5 ) * 2.0, 0.0, 1.0 ) * uAlpha.y;
	float a = 1.0 - ( 1.0 - l ) * ( 1.0 - d ) * ( 1.0 - f );
	if ( a <= 0.003 ) discard;
	vec3 lc = linearToOutputTexel( vec4( c, 1.0 ) ).rgb, fo = linearToOutputTexel( vec4( fc, 1.0 ) ).rgb, ko = linearToOutputTexel( vec4( uKeyCol, 1.0 ) ).rgb;
	gl_FragColor = vec4( l * lc + ( 1.0 - l ) * ( d * ko + ( 1.0 - d ) * f * fo ), a );
}`;

/** Locked-away limbs from a census (pure): `census` = { seen: [9], hidden: [9] } cell counts per ghost code (index 1..8);
 * `prev` = the last answer ([9] booleans). A limb is locked away while it is hidden in at least SEE.lockCells cells and
 * its seen share (seen / (seen + hidden)) is under SEE.lockOn; it stays so until that share rises over SEE.lockOff or it
 * is no longer hidden (so a share near the threshold does not flicker). */
export function seeLockedAway(census, prev = null, o = SEE) {
  const out = new Array(9).fill(false);
  if (!census || !Array.isArray(census.seen) || !Array.isArray(census.hidden)) return out;
  for (let c = 1; c <= 8; c++) {
    const s = Number(census.seen[c]) || 0, h = Number(census.hidden[c]) || 0;
    if (h < o.lockCells) continue;
    const share = s / (s + h), was = Boolean(prev && prev[c]);
    out[c] = was ? share <= o.lockOff : share < o.lockOn;
  }
  return out;
}

/**
 * The ghost pass. createGhostPass({ THREE, renderer, outline, reducedMotion }) wires itself to the outline pass
 * (outline.setAfterId) and returns:
 *  - composite: the full-screen mesh to add to the main scene (drawn right after the outline's ink);
 *  - frame(): once per frame after outline.render: the occlusion and census answers, the fill strengths (eased), the
 *    composite's visibility, a screen pass when only the focus changed;
 *  - locked(): [9] booleans, the limbs (ghost codes) locked away (filled, taken by the crosshair), or null;
 *  - setFocus(code): the limb (ghost code, 0 = none) that gets a line all round (what Shift would take);
 *  - setEnabled(on), state(), dispose().
 */
export function createGhostPass({ THREE, renderer, outline, enabled = true, reducedMotion = false } = {}) {
  if (!THREE || !renderer || !outline || typeof outline.setAfterId !== 'function') throw new Error('createGhostPass needs THREE, a renderer and the outline pass');
  const ok = typeof THREE.WebGLRenderTarget === 'function' && typeof THREE.ShaderMaterial === 'function' && renderer.capabilities && renderer.capabilities.isWebGL2 !== false;
  const nearest = extra => new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, stencilBuffer: false, ...extra });
  const ghostTarget = ok ? nearest({ depthBuffer: true }) : null;
  const inkTarget = ok ? nearest({ depthBuffer: false }) : null;
  const censusTarget = ok ? nearest({ depthBuffer: false }) : null;
  const view = new THREE.Vector4(1, 0.01, 100, 1);
  const geoUni = { tId: { value: null }, tDepth: { value: null }, tAdj: { value: null }, uView: { value: view }, uGap: { value: new THREE.Vector2(SEE.gapM, SEE.gapRel) } };
  const geoOf = (vertexShader, uniforms) => new THREE.ShaderMaterial({ uniforms: { ...geoUni, ...uniforms }, vertexShader, fragmentShader: GHOST_FS, side: THREE.DoubleSide, depthTest: true, depthWrite: true, blending: THREE.NoBlending, toneMapped: false, fog: false });
  const geoMat = geoOf(OUTLINE_ID_VS, {});
  // 19 November 2026 (performance): the muscles skinned on the graphics card are in the ID pass as a skinned batch (the
  // body's) and as skinned proxies (the left game arm's); they are drawn here with the same vertex shaders.
  const geoSkinBatchMat = geoOf(OUTLINE_SKIN_BATCH_VS, { nsBoneTex: { value: null }, nsHalf: { value: 128 } });
  const geoSkinIdMat = geoOf(OUTLINE_SKIN_ID_VS, { nsId: { value: new THREE.Vector3() } });
  const inkUni = {
    tGhost: { value: ghostTarget ? ghostTarget.texture : null }, tId: { value: null }, tDepth: { value: null },
    uSize: { value: [1, 1] }, uSS: { value: 1 }, uView: { value: view },
    uLine: { value: new THREE.Vector4(SEE.lineCss, SEE.focusCss, 1, OUTLINE.taperFullPxCm) }, uTaperMin: { value: OUTLINE.taperMin },
    uCssPerSample: { value: 1 }, uThin: { value: SEE.minWidthCm }, uKey: { value: SEE.keyCss }, uFocus: { value: 0 }
  };
  const screenMat = (fs, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: SCREEN_VS, fragmentShader: fs, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false, fog: false });
  const inkMat = screenMat(INK_FS, inkUni);
  const censusUni = { tGhost: inkUni.tGhost, tId: { value: null }, uSize: inkUni.uSize, uCells: { value: [SEE.censusCells, 1] }, uGrid: { value: 6 } };
  const censusMat = screenMat(CENSUS_FS, censusUni);
  const v3 = c => new THREE.Vector3(c[0], c[1], c[2]);
  const cols = seeLimbColours().map(v3), fillCols = seeLimbColours(SEE, SEE.fillWhite).map(v3);
  const keyCol = new THREE.Color().setRGB(...OUTLINE.colour, THREE.SRGBColorSpace);
  const fillA = new Array(9).fill(SEE.fillLow);
  const compMat = new THREE.ShaderMaterial({
    uniforms: { tInk: { value: inkTarget ? inkTarget.texture : null }, uCol: { value: cols }, uFillCol: { value: fillCols }, uFillA: { value: fillA },
      uKeyCol: { value: new THREE.Vector3(keyCol.r, keyCol.g, keyCol.b) }, uAlpha: { value: new THREE.Vector2(SEE.lineAlpha, SEE.keyAlpha) } },
    vertexShader: SCREEN_VS, fragmentShader: COMPOSITE_FS, transparent: true, premultipliedAlpha: true,
    blending: THREE.NormalBlending, depthTest: false, depthWrite: false, toneMapped: false, fog: false
  });
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const screenMesh = (mat, name) => { const m = new THREE.Mesh(quad, mat); m.name = name; m.frustumCulled = false; m.matrixAutoUpdate = false; m.raycast = () => {}; return m; };
  const sceneOf = (mat, name) => { const s = new THREE.Scene(); s.matrixWorldAutoUpdate = false; s.add(screenMesh(mat, name)); return s; };
  const inkScene = sceneOf(inkMat, 'ns-see ghost ink pass'), censusScene = sceneOf(censusMat, 'ns-see census pass');
  const composite = screenMesh(compMat, 'ns-see ghost composite (hidden limbs drawn over the part in front; display only)');
  composite.renderOrder = OUTLINE.renderOrder + 1;
  composite.visible = false;
  let on = enabled !== false && ok, drawn = false, last = null, focus = 0, focusDrawn = 0;
  const stats = { frames: 0, inkOnly: 0, ms: 0, census: 0 };
  // Only while something is covered: the ghost geometry pass is wrapped in an occlusion query (WebGL2, read a frame or
  // two later, never waited for); while the last answer is "nothing", the screen passes and the composite are skipped.
  const gl = typeof renderer.getContext === 'function' ? renderer.getContext() : null;
  const queries = Boolean(gl && typeof gl.createQuery === 'function' && gl.ANY_SAMPLES_PASSED_CONSERVATIVE !== undefined);
  let pendingQuery = null, hasGhost = true, inkStale = false;
  // The census: read back after each screen pass while something is covered.
  let censusWant = false, censusBusy = false, censusBuf = null, census = null, locked = new Array(9).fill(false);
  // QA only (globalThis.__nsSeeCount = true): after each ghost picture, the whole picture is read back once and counted.
  let counts = null, countBusy = false;
  let lastFrameAt = null;
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  function ink(ctx) {
    inkUni.tId.value = ctx.target.texture; inkUni.tDepth.value = ctx.depthTexture;
    inkUni.uSize.value = ctx.size; inkUni.uSS.value = ctx.ss;
    inkUni.uCssPerSample.value = 1 / Math.max(1e-6, ctx.pr * ctx.ss);
    // widths in samples; samples per cm at 1 m (the outline's CSS px per cm at 1 m times the samples per CSS px)
    inkUni.uLine.value.set(SEE.lineCss * ctx.pr * ctx.ss, SEE.focusCss * ctx.pr * ctx.ss, ctx.pxPerCmAt1m * ctx.pr * ctx.ss, OUTLINE.taperFullPxCm);
    inkUni.uKey.value = SEE.keyCss * ctx.pr * ctx.ss;
    inkUni.uFocus.value = focus; focusDrawn = focus;
    if (inkTarget.width !== ctx.bufW || inkTarget.height !== ctx.bufH) inkTarget.setSize(ctx.bufW, ctx.bufH);
    const cw = SEE.censusCells, ch = Math.max(1, Math.round(cw * ctx.bufH / Math.max(1, ctx.bufW)));
    if (censusTarget.width !== cw || censusTarget.height !== ch) censusTarget.setSize(cw, ch);
    censusUni.tId.value = ctx.target.texture; censusUni.uCells.value = [cw, ch];
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(inkTarget); renderer.render(inkScene, ctx.camera);
    renderer.setRenderTarget(censusTarget); renderer.render(censusScene, ctx.camera);
    renderer.setRenderTarget(prev);
    censusWant = true;
    if (globalThis.__nsSeeCount === true && !countBusy && typeof renderer.readRenderTargetPixelsAsync === 'function') {
      countBusy = true;
      const w = inkTarget.width, h = inkTarget.height, buf = new Uint8Array(w * h * 4);
      const cssPer = 1 / Math.max(1e-6, ctx.pr); // the boxes in CSS px
      renderer.readRenderTargetPixelsAsync(inkTarget, 0, 0, w, h, buf).then(b => {
        const c = { line: [0, 0, 0, 0, 0, 0, 0, 0, 0], fill: [0, 0, 0, 0, 0, 0, 0, 0, 0], boxes: {} };
        for (let i = 0; i < b.length; i += 4) {
          if (b[i + 3] < 100) continue;
          const k = b[i + 2]; if (!(k >= 1 && k <= 8)) continue;
          if (b[i] > 25) c.line[k]++;
          if (b[i + 1] > 25) c.fill[k]++;
          const px = (i / 4) % w, py = h - 1 - Math.floor(i / 4 / w), bx = c.boxes[k] || (c.boxes[k] = [px, py, px, py]);
          if (b[i] > 25 || b[i + 1] > 25) { bx[0] = Math.min(bx[0], px); bx[1] = Math.min(bx[1], py); bx[2] = Math.max(bx[2], px); bx[3] = Math.max(bx[3], py); }
        }
        for (const k of Object.keys(c.boxes)) c.boxes[k] = c.boxes[k].map(v => Math.round(v * cssPer));
        counts = c;
      }).catch(() => {}).finally(() => { countBusy = false; });
    }
  }
  function afterId(ctx) {
    if (!on) { drawn = false; return; }
    const t0 = now();
    const [w, h] = ctx.size;
    if (ghostTarget.width !== w || ghostTarget.height !== h) ghostTarget.setSize(w, h);
    const cam = ctx.camera;
    view.set(1, cam.near, cam.far, cam.isOrthographicCamera ? 0 : 1);
    geoUni.tId.value = ctx.target.texture; geoUni.tDepth.value = ctx.depthTexture; geoUni.tAdj.value = ctx.adjTex;
    // each thing of the ID pass with its own vertex shader and the ghost fragment shader (the batch, the skinned batch,
    // then the skinned proxies over the same depth)
    const scene = ctx.idScene, sb = ctx.skinBatch || null, sk = ctx.skinScene || null;
    const prevBatch = ctx.batch ? ctx.batch.material : null, prevSb = sb ? sb.material : null, prevSk = sk ? sk.overrideMaterial : null, prevAuto = renderer.autoClear;
    if (ctx.batch) ctx.batch.material = geoMat;
    if (sb) { sb.material = geoSkinBatchMat; geoSkinBatchMat.uniforms.nsBoneTex.value = ctx.skinBatchUniforms.nsBoneTex.value; geoSkinBatchMat.uniforms.nsHalf.value = ctx.skinBatchUniforms.nsHalf.value; }
    if (sk) sk.overrideMaterial = geoSkinIdMat;
    let q = null;
    if (queries && !pendingQuery) { try { q = gl.createQuery(); if (q) gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, q); } catch { q = null; } }
    try {
      renderer.setRenderTarget(ghostTarget); renderer.render(scene, cam);
      if (sk) { renderer.autoClear = false; renderer.render(sk, cam); }
    } finally {
      renderer.autoClear = prevAuto;
      if (ctx.batch) ctx.batch.material = prevBatch;
      if (sb) sb.material = prevSb;
      if (sk) sk.overrideMaterial = prevSk;
      if (q) { try { gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE); pendingQuery = q; } catch { pendingQuery = null; } }
    }
    if (hasGhost || focus) { ink(ctx); inkStale = false; } else inkStale = true;
    last = ctx; drawn = true;
    stats.frames++; stats.ms = now() - t0;
  }
  outline.setAfterId(ok ? afterId : null);

  /** Once per frame, after outline.render. */
  function frame() {
    const t = now(), dt = lastFrameAt === null ? 0 : Math.min(0.25, (t - lastFrameAt) / 1000); lastFrameAt = t;
    if (pendingQuery) {
      try {
        if (gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT_AVAILABLE)) { hasGhost = Boolean(gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT)); gl.deleteQuery(pendingQuery); pendingQuery = null; }
      } catch { pendingQuery = null; hasGhost = true; }
    }
    if (!hasGhost && locked.some(Boolean)) locked = new Array(9).fill(false);
    // the fill strength of each limb eases to its target (locked away: full; else light), at once under reduced motion
    const k = reducedMotion || !(dt > 0) ? 1 : 1 - Math.exp(-dt / SEE.fillEaseS);
    for (let c = 1; c <= 8; c++) { const target = locked[c] ? SEE.fillAlpha : SEE.fillLow; fillA[c] += (target - fillA[c]) * k; if (Math.abs(target - fillA[c]) < 0.004) fillA[c] = target; }
    if (globalThis.__nsSeeDebug === true) { compMat.uniforms.uAlpha.value.set(1, 1); for (let c = 1; c <= 8; c++) fillA[c] = 0.9; } // QA only: drawn strongly
    composite.visible = on && drawn && outline.composite.visible === true && (hasGhost || focus > 0);
    if (!composite.visible || !last) return;
    if (focus !== focusDrawn || inkStale) {
      const prevAuto = renderer.autoClear, prevAlpha = renderer.getClearAlpha(), c = new THREE.Color();
      renderer.getClearColor(c); renderer.setClearColor(0x000000, 0); renderer.autoClear = true;
      try { ink(last); inkStale = false; stats.inkOnly++; } finally { renderer.setClearColor(c, prevAlpha); renderer.autoClear = prevAuto; }
    }
    if (censusWant && hasGhost && !censusBusy && typeof renderer.readRenderTargetPixelsAsync === 'function') {
      const w = censusTarget.width, h = censusTarget.height;
      if (!censusBuf || censusBuf.length !== w * h * 4) censusBuf = new Uint8Array(w * h * 4);
      censusBusy = true; censusWant = false;
      renderer.readRenderTargetPixelsAsync(censusTarget, 0, 0, w, h, censusBuf).then(b => {
        const seen = new Array(9).fill(0), hidden = new Array(9).fill(0);
        for (let i = 0; i < b.length; i += 4) for (let c = 1; c <= 8; c++) { const bit = 1 << (c - 1); if (b[i] & bit) seen[c]++; if (b[i + 1] & bit) hidden[c]++; }
        census = { seen, hidden };
        locked = globalThis.__nsSeeLockAll === true ? hidden.map((h, c) => c > 0 && h > 0) : seeLockedAway(census, locked); // QA only: every hidden limb
        stats.census++;
      }).catch(() => {}).finally(() => { censusBusy = false; });
    }
  }
  function setFocus(code) { focus = Number.isInteger(code) && code >= 1 && code <= 8 ? code : 0; }
  function setEnabled(v) { on = v !== false && ok; if (!on) composite.visible = false; outline.invalidate(); return on; }
  function state() {
    return { supported: ok, enabled: on, drawn, shown: composite.visible, covered: hasGhost, queries, frames: stats.frames, focusOnlyFrames: stats.inkOnly, censusReads: stats.census,
      cpuMs: Math.round(stats.ms * 100) / 100, focus, locked: locked.map((v, c) => (v ? c : 0)).filter(Boolean), census, counts,
      target: ghostTarget ? [ghostTarget.width, ghostTarget.height] : null };
  }
  function dispose() {
    outline.setAfterId(null);
    if (pendingQuery) { try { gl.deleteQuery(pendingQuery); } catch { /* lost context */ } pendingQuery = null; }
    for (const t of [ghostTarget, inkTarget, censusTarget]) if (t) t.dispose();
    geoMat.dispose(); geoSkinBatchMat.dispose(); geoSkinIdMat.dispose(); inkMat.dispose(); censusMat.dispose(); compMat.dispose(); quad.dispose();
  }
  return { composite, frame, locked: () => (on && composite.visible ? locked.slice() : null), setFocus, setEnabled, state, dispose, get enabled() { return on; } };
}
