/** NeuroSurge: the ELECTRICAL MAP, the drawing (21 November 2026, section 192; the model and the owner's words are
 * in ns-emap.mjs).
 *
 * WHAT IS DRAWN. While the map is on (the M key): one clip-space quad that dims the finished picture (the dark
 * ground), then every wire of the model as a ribbon a few pixels wide and every mark as a small disc, in ONE geometry
 * with ONE shader, drawn twice: once in front of what is there, at full strength, and once where something stands in
 * front of the line, weaker, so the whole wiring is seen and the picture keeps its depth. Light never goes above
 * display white (the lines are screened onto the picture), so the map looks the same with and without the bloom pass.
 *
 * HOW IT IS CHEAP. Nothing is written per vertex after the build. A vertex carries its rest place, what it rides and
 * its coordinate along the route; the graphics card poses it from a small texture of world matrices (the "palette":
 * the big brain, then every segment of the mirror body and of your own body, the left game arm's included), and lights
 * it from two more small textures (which lit area has which wire, and each lit area's colour, level and start time)
 * and a clock. Per frame the processor multiplies about 250 matrices, steps the model's state machine and uploads a few
 * kilobytes; with the map off nothing exists and nothing runs. The outline pass, the picking and every existing
 * material are untouched.
 *
 * WHAT IT IS. A picture of the game's simulated, unitless signal on typical, simplified, hand-laid routes; slowed
 * down; not a recording and not traced from a scan (the meshes' names say so).
 *
 * THREE is injected (createEmapView); the shader texts are pure functions of the model's constants (emapShaders), so
 * Node can check them.
 */
import { EMAP, EMAP_FLAG, EMAP_MODE, buildEmapSteps, brainBoxesFromPositions, createEmapState, createEmapFrame, emapStep, emapLastVolley, EMAP_BRAIN_MESH } from './ns-emap.mjs';
import { EMAP_STORM, createStorms, stepStorms, stormAt, stormActs, scanRampGlsl, restartStorms } from './ns-emap-storm.mjs';
import { brainGapGlsl, brainGapUniformValue } from './ns-brain-gap.mjs';

/** The look of the lines (display choices, 21 November 2026; tuned on pictures at 1600 x 900 and at twice that):
 *  - minPx / maxPx: a line's half width in CSS pixels is its width in the world at its distance, kept between these;
 *  - dotMinPx / dotMaxPx: a mark's radius is never smaller or larger than these (CSS px), however far or near it is
 *    (a mark on your own shoulder, a hand's breadth from the eye, was a blob 40 px across);
 *  - idleGain: the resting wiring's light; focusDim: while a route is lit the resting wiring is drawn this much
 *    weaker, so the lit route is the brightest thing in the picture (eased in over focusInS, back over focusOutS; the
 *    game's own rule for its keys, ns-brain-ink BRAIN_KEYS.focusDim); nearM: a line fades out over this range of distance in front of the eye
 *    (metres: hidden nearer than the first, whole beyond the second), so nothing of your own body's wiring hangs across
 *    the picture;
 *  - orderDim / orderHidden / orderFront: the drawing order of the dark ground and the two passes (after everything of
 *    the ordinary picture, the 3D arrows at 100 included). */
export const EMAP_LOOK = Object.freeze({ minPx: 0.55, maxPx: 1.7, dotMinPx: 2.2, dotMaxPx: 15, idleGain: 0.2, focusDim: 0.6, focusInS: 0.12, focusOutS: 0.5, nearM: Object.freeze([0.16, 0.42]), orderDim: 200, orderHidden: 201, orderFront: 202,
  /* 22 November 2026 (part 3, the live scan; ns-emap-storm): muscleMaxPx / muscleScale: a contracting muscle's mark is
   * a soft glow in the scan's colours, muscleScale times the mark's size and up to muscleMaxPx (CSS px); netHidden: the
   * network's fibres inside the brain are drawn at this share where the brain's surface stands in front of them (the
   * other hidden lines at light.hidden: they would be lost inside it; 0.7 at first drew the fibres behind the mirror
   * body over it as a tangle); stormHeadMm: the fronts along the fibres (the
   * storm module's own); cordHeadS / cordTailS: the volley down the cord (its head and its tail, in the route's own
   * time coordinate); scanInflateMm: the scan is drawn on a copy of the brain's surface pushed out this far along its
   * normals (the living brain swells up to 1.6 mm round a key: the copy stays in front of it); the motor areas' blocks
   * are left out of the scan (22 November 2026: under it they vanished, the game's main targets; the lead's decision),
   * so they show in their own colour, halo and edge glow under the dark ground like the rest of the picture;
   * a pixel of a visible block keeps the dark ground and the scan off (the stencil mark the strip's own depth pass
   * writes, ns-scene-three STRIP_CUT, as the brain's surface and the vessels already do), so the blocks keep their
   * full colour; a second draw of the blocks was tried first and dropped: it drew each area's own meshes but not its
   * fill meshes, so every block lost the parts its fills draw and broke into dark triangles (a second checker found
   * it); 22 November, after a checker: netHidden 0.5 -> 0.15 (the fibres behind
   * the mirror body buried its torso), muscleMaxPx 24 -> 14 and muscleScale 1.6 -> 1.1 (stacked discs on a
   * forearm read as bubbles); brainHidden: the big brain's other lines where something stands in front of them (the
   * mirror body stands in front of the brain's middle, where every area's fibres and links meet: at the hidden light
   * of 0.4 they still covered its torso; 0.18, then 0.1 after a second checker); idleMirror: the mirror body's own
   * wiring at rest is drawn at this share (its nerves made a white web with a bright cord down its middle; lit routes
   * are not changed; 0.6, then 0.45 after a third checker, the cord's strand at cordMirror of that again: it stood as
   * a bright line down the mirror body's middle; its traffic too, and 0.5 after a fourth checker: at 0.7 on the
   * resting light only the cord was 4 % dimmer); orderScanDepth: the scan's depth pass is drawn after the strip's own
   * depth pass (1.5) and before the brain's glass (5 and 6), so the glass is not drawn under the scan and the scan
   * shows in its own colours on a dark brain (at 200.4 the glass under it kept 80 to 100 % of its light and the scan
   * read as a lilac brain, a third checker found; as an opaque material it had raced the strip at the rim); only while
   * the map is wholly on: while it eases in or out the depth pass is drawn after the glass and the scan's colour pass
   * covers the glass by the map's own amount, so the brain fades from its own colours to the scan and back with no step
   * (with 4.8 all the time the glass vanished at the first frame of M and jumped back at the last, a fourth checker);
   * frontOffset: the front pass of the lines is drawn a little nearer (polygon offset factor, units) than the hidden
   * pass, whose depth test is its exact complement: a line lying on a surface no longer flips between the two from frame
   * to frame (four spots shimmered at low quality; [-1, -4] moved the flip to other spots, [-2, -16] after a fourth
   * checker); trafficMirror /
   * trafficOwn: the traffic on the mirror body's wiring and on your own is this much weaker (the mirror body's wiring is
   * dense and small: at full traffic it screened to a white figure); orderScan: drawn after
   * the dark ground, before the lines. */
  muscleMaxPx: 14, muscleScale: 1.1, netHidden: 0.15, brainHidden: 0.1, trafficMirror: 0.35, trafficOwn: 0.6, cordHeadS: 0.004, cordTailS: 0.014, scanInflateMm: 1.8, orderScan: 200.5, orderScanDepth: 4.8, idleMirror: 0.45, cordMirror: 0.5, frontOffset: Object.freeze([-2, -16]) });

const f = v => { const s = String(Math.round(v * 1e6) / 1e6); return /[.e]/.test(s) ? s : `${s}.0`; };

/** The two shader texts for a model's constants (pure). The fragment rule is ns-emap emapLightAt, term for term. */
export function emapShaders(o = EMAP, look = EMAP_LOOK, S = EMAP_STORM) {
  const F = EMAP_FLAG;
  const vertexShader = `
uniform sampler2D uPal;
uniform sampler2D uWire;
uniform sampler2D uSlot;
uniform float uWireW;
uniform float uTime;
uniform float uOn;
uniform vec2 uRes;
uniform float uPx;
uniform vec4 uShow;
uniform vec4 uSt0[ ${S.slots} ];
uniform vec4 uSt1[ ${S.slots} ];
uniform float uNSt;
uniform float uSel;
attribute vec4 aNet;
attribute vec3 aPb;
attribute vec3 aTa;
attribute vec3 aTb;
attribute vec4 aBind;
attribute vec4 aGeo;
attribute vec4 aSig;
varying vec4 vDn;
varying vec4 vUp;
varying vec4 vColD;
varying vec3 vColU;
varying vec4 vAux;
varying vec4 vLine;
varying vec4 vMisc;
varying vec2 vDot;
varying vec4 vNet;
varying vec4 vTr;
varying float vHeat;
varying float vTg;
varying float vIg;
mat4 nsPal( float i ) {
	int y = int( i + 0.5 );
	return mat4( texelFetch( uPal, ivec2( 0, y ), 0 ), texelFetch( uPal, ivec2( 1, y ), 0 ), texelFetch( uPal, ivec2( 2, y ), 0 ), texelFetch( uPal, ivec2( 3, y ), 0 ) );
}
void main() {
	mat4 Ma = nsPal( aBind.x );
	mat4 Mb = nsPal( aBind.y );
	vec3 Xa = ( Ma * vec4( position, 1.0 ) ).xyz;
	vec3 Xb = ( Mb * vec4( aPb, 1.0 ) ).xyz;
	float w = aBind.z;
	vec3 X = mix( Xa, Xb, w );
	int fl = int( aSig.w + 0.5 );
	bool isDot = ( fl & ${F.dot} ) != 0;
	float show = 1.0;
	if ( ( fl & ${F.brain} ) != 0 ) show = uShow.x;
	if ( ( fl & ${F.mirror} ) != 0 ) show = uShow.y;
	if ( ( fl & ${F.bridge} ) != 0 ) show = uShow.x * uShow.y;
	if ( ( fl & ${F.own} ) != 0 ) show = uShow.z * ( ( fl & ${F.head} ) != 0 ? uShow.w : 1.0 );
	vec4 mv = viewMatrix * vec4( X, 1.0 );
	float sc = ( length( Ma[ 0 ].xyz ) + length( Ma[ 1 ].xyz ) + length( Ma[ 2 ].xyz ) ) / 3.0;
	float d = max( - mv.z, 1.0e-3 );
	float pxPerM = projectionMatrix[ 1 ][ 1 ] * uRes.y * 0.5 / d;
	float core = 1.0;
	float lane = 0.0;
	float across = 0.0;
	vDot = vec2( 0.0 );
	if ( isDot ) {
		float lift = aGeo.w * sc;
		mv.xyz *= 1.0 - min( 0.9, lift / max( length( mv.xyz ), 1.0e-4 ) );
		d = max( - mv.z, 1.0e-3 );
		pxPerM = projectionMatrix[ 1 ][ 1 ] * uRes.y * 0.5 / d;
		bool musc = ( fl & ${F.dotMuscle} ) != 0;
		float r = clamp( aGeo.z * sc * pxPerM * ( musc ? ${f(look.muscleScale)} : 1.0 ), ${f(look.dotMinPx)} * uPx, ( musc ? ${f(look.muscleMaxPx)} : ${f(look.dotMaxPx)} ) * uPx ) / pxPerM;
		mv.xy += aGeo.xy * r;
		vDot = aGeo.xy;
		gl_Position = projectionMatrix * mv;
	} else {
		core = clamp( aGeo.z * sc * pxPerM, ${f(look.minPx)} * uPx, ${f(look.maxPx)} * uPx );
		bool lanes = ( fl & ${F.lanes} ) != 0;
		lane = lanes ? core * 1.7 + 0.8 * uPx : 0.0;
		float halfW = lanes ? core * 4.6 + 2.5 * uPx : core * 3.3 + 2.0 * uPx;
		vec3 T = mix( mat3( Ma ) * aTa, mat3( Mb ) * aTb, w ) + aBind.w * ( Xb - Xa );
		vec3 Tv = mat3( viewMatrix ) * T;
		float tl = length( Tv );
		Tv = tl > 1.0e-9 ? Tv / tl : vec3( 1.0, 0.0, 0.0 );
		vec4 p0 = projectionMatrix * mv;
		vec4 p1 = projectionMatrix * vec4( mv.xyz + Tv * max( 1.0e-3, 0.02 * d ), 1.0 );
		vec2 dir = ( p1.xy / max( p1.w, 1.0e-6 ) - p0.xy / max( p0.w, 1.0e-6 ) ) * uRes;
		float dl = length( dir );
		dir = dl > 1.0e-6 ? dir / dl : vec2( 1.0, 0.0 );
		across = aGeo.x * halfW;
		p0.xy += vec2( - dir.y, dir.x ) * across * 2.0 / uRes * p0.w;
		gl_Position = p0;
	}
	float fade = show * uOn * smoothstep( ${f(look.nearM[0])}, ${f(look.nearM[1])}, d );
	// (which lines this mesh draws: all; only the network's, which are kept off the strip's blocks by the stencil; or all
	// but the network's)
	bool netLine = ( fl & ${F.net | F.link} ) != 0;
	if ( ( uSel > 0.5 && uSel < 1.5 && ! netLine ) || ( uSel > 1.5 && netLine ) ) fade = 0.0;
	if ( ! ( fade > 0.0 ) ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
	vLine = vec4( across, core, aSig.y, aSig.z );
	vMisc = vec4( fade, aSig.w, isDot ? 1.0 : aGeo.w, lane );
	float wi = aSig.x;
	// part 3: the network's regions and the place along the wire (vNet), the traffic's rate, spacing, phase and way
	// (vTr: ns-emap-storm trafficOf), and the storms' heat at a point of the brain (vHeat)
	vNet = aNet;
	float hsh = fract( abs( sin( wi * 12.9898 + 0.5 ) * 43758.5453 ) );
	float sp = ( fl & ${F.net} ) != 0 ? ${f(S.traffic.spacingMm.bundle)} : ( fl & ${F.brain} ) != 0 ? ${f(S.traffic.spacingMm.brain)} : ${f(S.traffic.spacingMm.body)};
	float wayDir = ( fl & ${F.sens} ) != 0 ? - 1.0 : ( fl & ${F.link | F.net} ) != 0 ? ( hsh < 0.5 ? 1.0 : - 1.0 ) : 1.0;
	vTr = vec4( ${f(S.traffic.hz[0])} + ${f(S.traffic.hz[1] - S.traffic.hz[0])} * hsh, 1.0 / sp, fract( hsh * 7.31 ), wayDir );
	// (the mirror body's cord and its roots, which together made a bright line down its middle, at cordMirror again)
	float spine = ( fl & ${F.cord | F.root} ) != 0 ? ${f(look.cordMirror)} : 1.0;
	vTg = ( fl & ${F.mirror} ) != 0 ? ${f(look.trafficMirror)} * spine : ( fl & ${F.own} ) != 0 ? ${f(look.trafficOwn)} : 1.0;
	// (the bridges from the big brain meet at the mirror body's neck, where they made the top of that line: at cordMirror)
	vIg = ( fl & ${F.bridge} ) != 0 ? ${f(look.cordMirror)} : ( fl & ${F.mirror} ) != 0 ? ${f(look.idleMirror)} * spine : 1.0;
	if ( ( fl & ${F.bridge} ) != 0 ) vTg *= ${f(look.cordMirror)};
	vHeat = 0.0;
	if ( ( fl & ${F.brain} ) != 0 && ! isDot ) {
		for ( int k = 0; k < ${S.slots}; k ++ ) {
			if ( float( k ) >= uNSt ) break;
			float dd = length( position - uSt0[ k ].xyz );
			float x = ( dd - uSt1[ k ].x ) / ${f(S.waveWMm)};
			vHeat += uSt0[ k ].w * exp( - dd * dd / ${f(S.coreMm * S.coreMm * 1.6)} ) + uSt1[ k ].y * exp( - x * x );
		}
	}
	float wy = floor( ( wi + 0.5 ) / uWireW );
	vec4 W = texelFetch( uWire, ivec2( int( wi - wy * uWireW + 0.5 ), int( wy + 0.5 ) ), 0 );
	vDn = vec4( 0.0, 0.0, 0.0, W.y );
	vUp = vec4( 0.0 );
	vColD = vec4( 0.0 );
	vColU = vec3( 0.0 );
	vAux = vec4( 0.0 );
	if ( W.x > 0.5 ) {
		int s = int( W.x - 0.5 );
		vec4 c = texelFetch( uSlot, ivec2( 0, s ), 0 );
		vec4 q = texelFetch( uSlot, ivec2( 1, s ), 0 );
		vAux = texelFetch( uSlot, ivec2( 2, s ), 0 );
		vColD = vec4( c.rgb, q.z );
		vDn = vec4( c.a, uTime - q.x, q.y, W.y );
	}
	if ( W.z > 0.5 ) {
		int s = int( W.z - 0.5 );
		vec4 c = texelFetch( uSlot, ivec2( 0, s ), 0 );
		vec4 q = texelFetch( uSlot, ivec2( 1, s ), 0 );
		vColU = c.rgb;
		vUp = vec4( c.a, uTime - q.x, W.w, q.z );
	}
}`;
  const L = o.light, B = o.bead, D = o.dot, K = o.link, C = o.colours;
  const fragmentShader = `
uniform float uGain;
uniform float uGainLit;
uniform float uIdle;
uniform float uReduced;
uniform float uTime;
uniform float uTraffic;
uniform float uNetGain;
uniform vec4 uSt1[ ${S.slots} ];
uniform vec4 uSt2[ ${S.slots} ];
uniform float uNSt;
varying vec4 vNet;
varying vec4 vTr;
varying float vHeat;
varying float vTg;
varying float vIg;
varying vec4 vDn;
varying vec4 vUp;
varying vec4 vColD;
varying vec3 vColU;
varying vec4 vAux;
varying vec4 vLine;
varying vec4 vMisc;
varying vec2 vDot;
float nsSq( float x ) { return x * x; }
float nsBead( float p ) { return exp( - p * ${f(B.tail)} ) + exp( - ( 1.0 - p ) * ${f(B.lead)} ); }
float nsProfile( float dist, float core ) { float x = dist / max( core, 1.0e-3 ); return exp( - x * x * 1.3 ) + 0.1 * exp( - x * x * 0.17 ); }
${scanRampGlsl()}
void main() {
	int fl = int( vMisc.y + 0.5 );
	bool isDot = ( fl & ${F.dot} ) != 0;
	bool red = uReduced > 0.5;
	float a = vLine.z;
	float tau = vDn.w;
	float scale = isDot ? 1.0 : vMisc.z;
	float dn = 0.0;
	float head = 0.0;
	float mode = vColD.a;
	if ( vDn.x > 0.0 ) {
		float level = vDn.x;
		float t = vDn.y;
		float a0 = vDn.z;
		if ( mode > ${f(EMAP_MODE.spark - 0.5)} && mode < ${f(EMAP_MODE.spark + 0.5)} ) {
			float amp = nsSq( sin( 3.14159265 * clamp( t / max( vAux.z, 1.0e-3 ), 0.0, 1.0 ) ) );
			dn = isDot ? 0.0 : amp * exp( - nsSq( ( a - ( a0 + vAux.x * t ) ) / max( vAux.y, 1.0e-7 ) ) );
		} else if ( mode > ${f(EMAP_MODE.hint - 0.5)} ) {
			dn = ( isDot || a > tau ) ? 0.0 : level * ${f(L.hint)};
		} else if ( ( fl & ${F.link} ) != 0 ) {
			dn = red ? level * ${f(K.gain * K.steady)} : level * ${f(K.gain)} * nsSq( max( 0.0, 1.0 - t / ${f(K.fadeS)} ) ) * exp( - nsSq( ( a - t ) / ${f(K.sigmaS)} ) );
		} else if ( ( fl & ${F.dotBlock} ) != 0 ) {
			dn = level * ${f(D.block)};
		} else if ( ( fl & ${F.sens} ) == 0 ) {
			float front = red ? 1.0e9 : a0 + t;
			if ( a <= min( front, tau ) + 1.0e-6 ) {
				if ( ( fl & ${F.dotMuscle} ) != 0 ) {
					dn = level * ( ${f(D.hold)} + ( red ? 0.0 : ${f(D.pop)} * exp( - ( front - a ) / ${f(D.popS)} ) ) );
				} else {
					head = red ? 0.0 : ${f(L.head)} * exp( - nsSq( ( front - a ) / ${f(L.headS)} ) );
					float p = fract( a * scale / ${f(B.downSpanS)} - uTime * ${f(B.downHz)} ); // (the map's clock, not the volley's: every lit wire at one place beats in one phase, so strands in one pixel beat together)
					dn = level * ( ${f(L.hold)} + ( red ? ${f(L.steady)} : ${f(B.gain)} * nsBead( p ) ) + head );
				}
			}
		}
	}
	float up = 0.0;
	if ( vUp.x > 0.0 && vUp.w > 0.5 && vUp.w < 1.5 && ( fl & ${F.link | F.dotMuscle | F.dotBlock} ) == 0 ) {
		float level = vUp.x;
		float t = vUp.y;
		float upU = vUp.z;
		float front = red ? - 1.0e9 : ${f(o.upShare)} * ( upU - t );
		if ( a >= front - 1.0e-6 && a <= tau + 1.0e-6 ) {
			if ( ( fl & ${F.dotPatch} ) != 0 ) {
				up = level * ( ${f(D.patchHold)} + ( red ? 0.0 : ${f(D.patchPop)} * exp( - ( t - ( upU - a / ${f(o.upShare)} ) ) / ${f(D.patchS)} ) ) );
			} else if ( ! isDot ) {
				float hu = red ? 0.0 : ${f(L.headUp)} * exp( - nsSq( ( a - front ) / ${f(L.headUpS)} ) );
				float p = fract( a * scale / ${f(B.upSpanS)} + uTime * ${f(B.upHz)} );
				up = level * ( ${f(L.holdUp)} + ( red ? ${f(L.steady)} : ${f(B.gainUp)} * nsBead( p ) ) + hu );
			}
		}
	}
	// part 3: the storms' fronts along the network's fibres, the volley down the cord, the traffic on every wire
	float storm = 0.0;
	float stormHead = 0.0;
	if ( ! red && ! isDot && ( fl & ${F.net} ) != 0 ) {
		for ( int k = 0; k < ${S.slots}; k ++ ) {
			if ( float( k ) >= uNSt ) break;
			float rg = uSt1[ k ].z;
			float fr = uSt1[ k ].w;
			float amp = uSt2[ k ].x;
			if ( fr < 0.0 || amp <= 0.0 ) continue;
			bool fromA = abs( rg - vNet.x ) < 0.5;
			if ( ! fromA && abs( rg - vNet.y ) > 0.5 ) continue;
			float x = fromA ? vNet.z : vNet.w - vNet.z;
			float hd = exp( - nsSq( ( x - fr ) / ${f(S.fibreHeadMm)} ) );
			storm += amp * ( x <= fr ? 0.45 + 0.55 * hd : hd );
			stormHead = max( stormHead, amp * hd );
		}
	}
	if ( ! red && ! isDot && ( fl & ${F.cord | F.bridge} ) != 0 ) {
		for ( int k = 0; k < ${S.slots}; k ++ ) {
			if ( float( k ) >= uNSt ) break;
			float ca = uSt2[ k ].z;
			if ( ca <= 0.0 || uSt2[ k ].y < - 5.0 ) continue;
			float da = a - uSt2[ k ].y;
			float hd = exp( - nsSq( da / ${f(look.cordHeadS)} ) );
			storm += ca * ( hd + ( da < 0.0 ? 0.4 * exp( da / ${f(look.cordTailS)} ) : 0.0 ) );
			stormHead = max( stormHead, ca * hd );
		}
	}
	float traffic = 0.0;
	if ( ! red && ! isDot && uTraffic > 0.0 ) traffic = ( fl & ${F.cord} ) != 0
		// (the cord's two strands lie in one pixel: their pulses keep the step of a lit route's beads, so a lit strand and
		// a resting one beside it never add up to more than the beads alone)
		? nsBead( fract( a / ${f(B.downSpanS)} - uTime * ${f(B.downHz)} ) )
		: nsBead( fract( vNet.z * vTr.y - vTr.w * uTime * vTr.x + vTr.z ) );
	// (on a lit route its own beads are the traffic: the resting pulses give way, so lanes and pulses never add up)
	traffic *= 1.0 - clamp( ( dn + up ) * 4.0, 0.0, 1.0 );
	vec3 cD = mix( vColD.rgb, vec3( 1.0 ), clamp( ${f(C.whiteLit)} + head * ${f(C.whiteHead)} + max( dn - 1.2, 0.0 ) * 0.5, 0.0, 0.85 ) );
	vec3 cU = mix( vColU, vec3( 1.0 ), ${f(C.paleUp)} );
	vec3 col;
	if ( isDot ) {
		float r = length( vDot );
		if ( r > 1.0 ) discard;
		if ( ( fl & ${F.dotMuscle} ) != 0 ) {
			// part 3: a contracting muscle glows in the scan's colours, hottest at its middle
			float gm = exp( - r * r * 2.2 ) * ( 1.0 - smoothstep( 0.85, 1.0, r ) );
			col = nsScanRamp( 0.55 + 0.4 * min( 1.0, dn ) * ( 1.0 - 0.5 * r ) ) * dn * gm * uGainLit;
		} else {
			float g = exp( - r * r * 3.2 ) * ( 1.0 - smoothstep( 0.8, 1.0, r ) );
			col = ( mix( vColD.rgb, vec3( 1.0 ), 0.25 ) * dn + cU * up ) * g * uGainLit;
		}
	} else {
		float x = vLine.x;
		float core = vLine.y;
		float lane = vMisc.w;
		// (the hidden pass: the network's fibres at netHidden, the other lines of the big brain at brainHidden, the bodies'
		// lines at the hidden light; the front pass at 1)
		float netG = uNetGain < 0.999 ? ( ( fl & ${F.net} ) != 0 ? uNetGain : ( fl & ${F.brain} ) != 0 ? min( uGain, ${f(look.brainHidden)} ) : uGain ) : uGain;
		float ht = clamp( vHeat, 0.0, 1.0 );
		vec3 idleC = mix( vec3( ${f(C.idle[0])}, ${f(C.idle[1])}, ${f(C.idle[2])} ), nsScanRamp( 0.35 + 0.65 * ht ), clamp( ht * 1.6, 0.0, 1.0 ) );
		float prof = nsProfile( abs( x ), core );
		col = idleC * ( vLine.w * uIdle * netG * vIg * ( 1.0 + 1.5 * ht ) * prof );
		col += nsScanRamp( 0.42 + 0.5 * ht ) * ( traffic * uTraffic * vTg * netG * max( vLine.w, 0.35 ) * prof );
		col += nsScanRamp( 0.76 + 0.24 * clamp( stormHead, 0.0, 1.0 ) ) * ( storm * uGainLit * netG * prof );
		col += cD * ( dn * uGainLit * nsProfile( abs( x + lane ), core * ${f(L.wide)} ) );
		col += cU * ( up * uGainLit * nsProfile( abs( x - lane ), core * ${f(L.wide * 0.75)} ) );
	}
	col *= vMisc.x;
	if ( max( col.r, max( col.g, col.b ) ) < 0.004 ) discard;
	gl_FragColor = vec4( min( col, vec3( 1.0 ) ), 1.0 );
	#include <colorspace_fragment>
}`;
  return { vertexShader, fragmentShader };
}

const DIM_VS = 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }';

/** The live scan's two shader texts (22 November 2026, part 3; pure): the brain's surface, pushed out a little along
 * its normals, coloured by the sum of the resting sources, the storms and the activations that ns-emap-storm works out
 * once a frame (scanHeatAt is the same sum in JS), on the scan's colour scale, screened onto the dimmed picture. The
 * surface's own light shows through: the colour is weaker where the surface turns away. */
export function emapScanShaders(S = EMAP_STORM) {
  // (the brain's own cut next to the gap between the halves, ns-brain-gap: where the glass is cut open, the copy is not
  // coloured and writes no depth; and the heat fades toward the midline, EMAP_STORM.midFadeMm, 22 November 2026)
  const gap = brainGapGlsl();
  // (22 November 2026: the heat is summed at the vertices and laid between them, not at every pixel: the brain's copy
  // has about 100 000 triangles, a few millimetres each, far finer than the 15 mm and wider shapes of the heat, and a
  // frame with the map on had cost a third of the frame rate with the sum at every pixel)
  const vertexShader = `
invariant gl_Position;
uniform float uInflate;
uniform float uHeat;
uniform float uNSt;
uniform float uNAct;
uniform vec4 uBase[ ${S.base.n} ];
uniform vec4 uSt0[ ${S.slots} ];
uniform vec4 uSt1[ ${S.slots} ];
uniform vec4 uAct[ ${S.act.n} ];
attribute float nsSulc;
attribute vec2 nsGap;
varying vec3 vN;
varying vec3 vV;
varying float vSulc;
varying float vH;
varying vec2 vNsGap;
varying vec3 vNsGapP;
void main() {
	vSulc = nsSulc;
	vNsGap = nsGap;
	vNsGapP = position;
	vec4 mv = modelViewMatrix * vec4( position + normal * uInflate, 1.0 );
	vN = normalMatrix * normal;
	vV = - mv.xyz;
	gl_Position = projectionMatrix * mv;
	vH = 0.0;
	if ( uHeat > 0.5 ) {
		vec3 P = position;
		float h = ${f(S.floor)};
		for ( int i = 0; i < ${S.base.n}; i ++ ) { vec3 d = P - uBase[ i ].xyz; h += uBase[ i ].w * exp( - dot( d, d ) / ${f(S.base.radiusMm * S.base.radiusMm)} ); }
		for ( int k = 0; k < ${S.slots}; k ++ ) {
			if ( float( k ) >= uNSt ) break;
			float d = length( P - uSt0[ k ].xyz );
			float x = ( d - uSt1[ k ].x ) / ${f(S.waveWMm)};
			h += uSt0[ k ].w * exp( - d * d / ${f(S.coreMm * S.coreMm)} ) + uSt1[ k ].y * exp( - x * x );
		}
		h = ${f(S.floor)} + ( h - ${f(S.floor)} ) * smoothstep( ${f(S.midFadeMm[0])}, ${f(S.midFadeMm[1])}, abs( P.x ) );
		// (the activation after the fade: an area near the midline, a leg's or a foot's, keeps its own heat)
		for ( int j = 0; j < ${S.act.n}; j ++ ) { if ( float( j ) >= uNAct ) break; vec3 d = P - uAct[ j ].xyz; h += uAct[ j ].w * exp( - dot( d, d ) / ${f(S.act.radiusMm * S.act.radiusMm)} ); }
		vH = h;
	}
}`;
  const fragmentShader = `
uniform float uOn;
uniform float uCover;
varying vec3 vN;
varying vec3 vV;
varying float vSulc;
varying float vH;
varying vec2 vNsGap;
varying vec3 vNsGapP;
${gap.head}
${scanRampGlsl()}
void main() {
	float facing = abs( dot( normalize( vN ), normalize( vV ) ) );
	float cut = nsGapIn( vNsGapP, vNsGap ); // (not discarded here: that would turn off the early depth test)
	// the brain's shape stays readable: weaker where the surface turns away and in the grooves (the glass's own groove
	// depth, nsSulc; 0 on the motor areas' copy, which has none)
	float tn = nsScanTone( vH );
	vec3 c = nsScanRamp( tn ) * nsScanAmount( tn ) * ( 0.3 + 0.7 * facing * facing ) * ( 1.0 - 0.5 * clamp( vSulc, 0.0, 1.0 ) ) * ( 1.0 - cut ) * uOn;
	// (alpha: how much of what lies under the scan it covers while the map eases in or out, uCover; see frameStep)
	gl_FragColor = vec4( min( c, vec3( 1.0 ) ), uCover * ( 1.0 - cut ) );
	#include <colorspace_fragment>
}`;
  // the depth pass: nothing but the cut
  const depthFragmentShader = `
varying vec2 vNsGap;
varying vec3 vNsGapP;
${gap.head}
void main() { if ( nsGapIn( vNsGapP, vNsGap ) > 0.5 ) discard; gl_FragColor = vec4( 0.0 ); }`;
  return { vertexShader, fragmentShader, depthFragmentShader };
}

/** The brain's surface for the scan: the glass drawn in one piece (its points and normals shared, not copied). The
 * motor areas are not in it (22 November 2026, the lead's decision after a checker: under the scan the strip's blocks
 * vanished); the stencil keeps the scan and the dark ground off their pixels (createEmapView, stripKeep). Returns
 * [{ geo, own }] ([] when the scene has no such glass). */
function scanSurfaces(THREE, objects) {
  const out = [];
  const glass = objects.brainGroup && objects.brainGroup.children ? objects.brainGroup.children.find(m => m && m.isMesh && /every piece, one draw/.test(String(m.name)) && !/depth|x-ray/.test(String(m.name))) : null;
  if (!(glass && glass.geometry && glass.geometry.attributes.position && glass.geometry.attributes.normal)) return out;
  // Only the brain's outer pieces: the deep ones (the white matter, the ventricles and the small parts in the middle) lie
  // a few millimetres under the cortex, and pushed out 1.8 mm with the copy they came through it in triangle-sized
  // patches; nor the strip's own surface, where the glass carries it. The one-piece glass is its pieces one after another (objects.glass, in
  // order): the copy takes its own index of the kept pieces' triangles; its points and normals are the glass's own.
  const G = glass.geometry, pieces = Array.isArray(objects.glass) ? objects.glass : [];
  let total = 0;
  for (const m of pieces) total += m && m.geometry && m.geometry.index ? m.geometry.index.count : 0;
  const skip = m => /unassigned motor-strip|precentral|white matter|ventricle|aqueduct|habenula|tuber|pineal|colliculus|hypothalamus/i.test(String(m && m.name));
  out.diag = { pieces: pieces.length, total, index: G.index ? G.index.count : 0, skipped: pieces.filter(skip).map(m => String(m.name).slice(0, 40)), names: pieces.slice(0, 6).map(m => String(m.name).slice(0, 30)) };
  if (G.index && pieces.length && total === G.index.count && pieces.some(skip)) {
    const src = G.index.array, keep = [];
    let at = 0, n = 0;
    for (const m of pieces) { const c = m.geometry.index.count; if (!skip(m)) { keep.push([at, c]); n += c; } at += c; }
    const I = new Uint32Array(n);
    let o = 0;
    for (const [from, c] of keep) { I.set(src.subarray(from, from + c), o); o += c; }
    const g = new THREE.BufferGeometry();
    for (const name of Object.keys(G.attributes)) g.setAttribute(name, G.attributes[name]);
    g.setIndex(new THREE.BufferAttribute(I, 1));
    out.push({ geo: g, own: true });
  } else out.push({ geo: G, own: false });
  return out;
}
const DIM_FS = 'uniform float uAlpha;\nvoid main() { gl_FragColor = vec4( 0.0, 0.0, 0.0, uAlpha ); }';

/** a = b x c for column-major 4 x 4 matrices: b and c array-likes of 16, the result into `out` at `at`. No allocation. */
function mul4Into(out, at, b, c) {
  for (let col = 0; col < 4; col++) {
    const c0 = c[4 * col], c1 = c[4 * col + 1], c2 = c[4 * col + 2], c3 = c[4 * col + 3];
    out[at + 4 * col] = b[0] * c0 + b[4] * c1 + b[8] * c2 + b[12] * c3;
    out[at + 4 * col + 1] = b[1] * c0 + b[5] * c1 + b[9] * c2 + b[13] * c3;
    out[at + 4 * col + 2] = b[2] * c0 + b[6] * c1 + b[10] * c2 + b[14] * c3;
    out[at + 4 * col + 3] = b[3] * c0 + b[7] * c1 + b[11] * c2 + b[15] * c3;
  }
}

/** A small number for a list of names, without making a string (the muscles of a link, to notice when they change). */
function hashNames(h, s) {
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (Math.imul(h, 31) + 7) | 0;
}

/** What the model is built from, read off the live game (no scene method is added for it):
 *  - the brain's meshes as boxes and the two postcentral gyri's points, from the loaded brain assets (already drawn apart);
 *  - the motor areas' places: each scene region's own centre and its movements' key centres;
 *  - every muscle of the body rig (its rest centre and the segments it rides, from the rig) and of the left game arm
 *    (its rest centre and the arm segment most of its skin weight is on, from the scene's arm muscles).
 * Pure but for reading `objects`. */
export function emapInputsFromScene({ objects, bodyRig, brainAssets, armSegments }) {
  const boxes = brainBoxesFromPositions(new Map([...brainAssets].map(([id, rec]) => [id, { name: (rec.entry && rec.entry.embedded_source_name) || id, positions: rec.mesh && rec.mesh.positions }])));
  const surf = side => { const rec = brainAssets.get(EMAP_BRAIN_MESH.postcentral[side]); return rec && rec.mesh ? rec.mesh.positions : null; };
  const areas = new Map();
  for (const rec of objects.regions) {
    if (!rec || typeof rec.id !== 'string' || !rec.markCentre) continue;
    const keys = {};
    if (rec.keys) for (const [id, k] of rec.keys) if (k && k.centre) keys[id] = [k.centre[0], k.centre[1], k.centre[2]];
    areas.set(rec.id, { centre: [rec.markCentre[0], rec.markCentre[1], rec.markCentre[2]], keys });
  }
  const muscles = [];
  for (const m of bodyRig.muscles) {
    const s = bodyRig.meshSegment[m.id], b = (s && s.blend) || [];
    if (s && s.restCentroid) muscles.push({ id: m.id, name: m.name, side: m.side, rig: 'body', seg: s.segment, seg2: b[1] ? b[1][0] : null, w2: b[1] ? b[1][1] : 0, centre: s.restCentroid });
  }
  const tw = { forearm_tw1: 'ulna', forearm_tw2: 'ulna', forearm_tw3: 'forearm' };
  for (const m of objects.muscles) {
    if (!m || typeof m.id !== 'string' || !m.rest || m.rest.length < 9) continue;
    const P = m.rest, n = P.length / 3, step = Math.max(1, Math.floor(n / 300)), c = [0, 0, 0], count = new Map();
    let k = 0;
    for (let v = 0; v < n; v += step, k++) { c[0] += P[3 * v]; c[1] += P[3 * v + 1]; c[2] += P[3 * v + 2]; const i = m.weights && m.weights.i0 ? m.weights.i0[v] : 0; count.set(i, (count.get(i) || 0) + 1); }
    let seg = 0, best = -1;
    for (const [i, q] of count) if (q > best) { best = q; seg = i; }
    const name = armSegments[seg] || 'upperarm';
    muscles.push({ id: m.id, name: String((m.mesh && m.mesh.name) || m.id), side: 'left', rig: 'arm', seg: tw[name] || name, centre: [c[0] / k, c[1] / k, c[2] / k] });
  }
  return { boxes, areas, muscles, surface: { left: surf('left'), right: surf('right') } };
}

/**
 * The map's view. { THREE, objects (the scene's `objects`), o, look }. Returns:
 *   prepare(inputs)          hand over buildEmapSteps' inputs (the app gathers them); the build then runs in work()
 *   work(budgetMs)           run the build for at most budgetMs; true once the model and its meshes are made
 *   setOn(on)                ask for the map on or off (it eases); nothing is drawn or computed while off and eased out
 *   frame(f)                 once a frame while on or easing: f = { nowMs, links (the list handed to setGlowLinks),
 *                            sources (ns-actions glowLinks().links: which of them a look or a click switched on),
 *                            areas (ns-actions glowLinks().areas), marks (stepFrame's out.marks), segments (the body
 *                            pose's Map of segment matrices, source rest -> drawn), headInPlace (0..1), reduced }
 *   state()                  plain data for inspect().emap
 *   dispose()
 */
export function createEmapView({ THREE, objects, o = EMAP, look = EMAP_LOOK, stripRef = 1 } = {}) {
  if (!THREE || !objects || !objects.scene) throw new Error('ns:emap_view: THREE and the scene\'s objects are needed');
  const scene = objects.scene;
  let steps = null, model = null, st = null, frame = null, built = false, buildMs = 0, buildSlices = 0, error = null;
  let want = false, amount = 0, lastMs = NaN, clock0 = NaN;
  let geo = null, front = null, frontNet = null, hidden = null, dimMesh = null, pal = null, palTex = null, wireTex = null, slotTex = null, uniforms = null;
  let segs = null, armBone = null, palKept = null;
  // part 3: the storms (ns-emap-storm), the live scan's meshes and material, each area slot's last start (a new one is a
  // new volley: a storm starts on its block), the area the look rests on
  let storms = null, scanMat = null, keptT0 = null;
  const scanMeshes = [], scanOwnGeo = [], scanDepthMats = [];
  let scanDiag = null, scanFull = false;
  // (one options object for the storms' step, refilled each frame)
  const stormOpts = { lookRegion: -1, reduced: false, eye: null };
  /** Nothing of the map over a pixel of a visible block: the stencil mark the strip's own depth pass writes (ns-scene-three
   * STRIP_CUT; read only here, write mask 0). Without a stencil buffer the test passes and the map is drawn as before. */
  const stripKeep = m => { m.stencilWrite = true; m.stencilWriteMask = 0; m.stencilRef = stripRef; m.stencilFunc = THREE.NotEqualStencilFunc; return m; };
  const eyeLocal = new THREE.Vector3(), invBrain = new THREE.Matrix4(), eyeArr = [0, 0, 0];
  const linkCache = new Map();
  let sigNext = 1, lit = 0, framesOn = 0, palWrites = 0, lastStepMs = 0, lastPalMs = 0, sumStepMs = 0, sumPalMs = 0, focus = 0;
  const size = new THREE.Vector2();
  const ident = new THREE.Matrix4().elements.slice();
  const tmpArm = new THREE.Matrix4();

  function prepare(inputs) {
    if (steps || built) return;
    try { steps = buildEmapSteps({ ...inputs, o }); } catch (err) { error = String((err && err.message) || err); steps = null; }
  }
  function work(budgetMs = 4) {
    if (built || error) return built;
    if (!steps) return false;
    const t0 = performance.now();
    try {
      for (;;) {
        const r = steps.next();
        if (r.done) { model = r.value; break; }
        if (performance.now() - t0 >= budgetMs) { buildMs += performance.now() - t0; buildSlices++; return false; }
      }
      make();
    } catch (err) { error = String((err && err.message) || err); steps = null; return false; }
    buildMs += performance.now() - t0; buildSlices++;
    steps = null; built = true;
    return true;
  }

  function dataTex(data, w, h) {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  }
  function make() {
    const V = model.vertices;
    st = createEmapState(model); frame = createEmapFrame(model);
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(V.pa, 3));
    geo.setAttribute('aPb', new THREE.BufferAttribute(V.pb, 3));
    geo.setAttribute('aTa', new THREE.BufferAttribute(V.ta, 3));
    geo.setAttribute('aTb', new THREE.BufferAttribute(V.tb, 3));
    geo.setAttribute('aBind', new THREE.BufferAttribute(V.bind, 4));
    geo.setAttribute('aGeo', new THREE.BufferAttribute(V.geo, 4));
    geo.setAttribute('aSig', new THREE.BufferAttribute(V.sig, 4));
    geo.setAttribute('aNet', new THREE.BufferAttribute(V.net, 4));
    geo.setIndex(new THREE.BufferAttribute(V.index, 1));
    pal = new Float32Array(16 * model.palette.size);
    for (let i = 0; i < model.palette.size; i++) pal.set(ident, 16 * i);
    palTex = dataTex(pal, 4, model.palette.size);
    wireTex = dataTex(st.wireTex, model.wireTexW, model.wireTexH);
    slotTex = dataTex(st.slotTex, 4, o.slots);
    const sh = emapShaders(o, look);
    storms = createStorms({ regions: model.scanRegions || [], links: model.scanLinks || [] });
    keptT0 = new Float64Array(o.slots).fill(NaN);
    uniforms = { uPal: { value: palTex }, uWire: { value: wireTex }, uSlot: { value: slotTex }, uWireW: { value: model.wireTexW }, uTime: { value: 0 }, uOn: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 }, uShow: { value: new THREE.Vector4(1, 1, 1, 0) }, uReduced: { value: 0 }, uIdle: { value: look.idleGain },
      uSt0: { value: storms.storm0 }, uSt1: { value: storms.storm1 }, uSt2: { value: storms.storm2 }, uNSt: { value: 0 }, uTraffic: { value: EMAP_STORM.traffic.gain } };
    const material = (gain, gainLit, depthFunc, netGain, sel = 0, offset = null) => new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uGain: { value: gain }, uGainLit: { value: gainLit }, uNetGain: { value: netGain }, uSel: { value: sel } }, vertexShader: sh.vertexShader, fragmentShader: sh.fragmentShader,
      transparent: true, depthWrite: false, depthTest: true, depthFunc, toneMapped: false, side: THREE.DoubleSide,
      polygonOffset: Boolean(offset), polygonOffsetFactor: offset ? offset[0] : 0, polygonOffsetUnits: offset ? offset[1] : 0,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
    });
    const mesh = (name, mat, order) => {
      const m = new THREE.Mesh(geo, mat);
      m.name = name; m.frustumCulled = false; m.matrixAutoUpdate = false; m.renderOrder = order; m.visible = false;
      m.raycast = () => {}; // never picked
      scene.add(m);
      return m;
    };
    // the hidden pass (kept off the strip's blocks: what lies behind a block is not drawn over it), and the front pass in
    // two parts: the routes and the bodies' wiring over everything, the network's lines not over a block
    hidden = mesh('ns-electrical map, the part hidden behind things (typical routes, simplified; a picture of the simulation, not a recording)', stripKeep(material(o.light.hidden, o.light.hiddenLit, THREE.GreaterDepth, look.netHidden)), look.orderHidden);
    front = mesh('ns-electrical map (typical routes, simplified; a picture of the simulation, not a recording)', material(1, 1, THREE.LessEqualDepth, 1, 2, look.frontOffset), look.orderFront);
    frontNet = mesh('ns-electrical map, the brain\'s network in front of things (generated, drawn; not a recording)', stripKeep(material(1, 1, THREE.LessEqualDepth, 1, 1, look.frontOffset)), look.orderFront);
    const dimMat = new THREE.ShaderMaterial({ uniforms: { uAlpha: { value: 0 } }, vertexShader: DIM_VS, fragmentShader: DIM_FS, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    stripKeep(dimMat);
    dimMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dimMat);
    dimMesh.name = 'ns-electrical map, the dark ground (the picture dimmed while the map is on)';
    dimMesh.frustumCulled = false; dimMesh.matrixAutoUpdate = false; dimMesh.renderOrder = look.orderDim; dimMesh.visible = false; dimMesh.raycast = () => {};
    // the palette is made when the dark ground is about to be drawn: the first of the map's draws, and after the
    // scene's world matrices are brought up to date for the frame
    dimMesh.onBeforeRender = renderer => writePalette(renderer);
    scene.add(dimMesh);
    // the live scan: the brain's surface (the glass in one piece, the motor areas merged), one material, drawn after the
    // dark ground and before the lines; it rides the brain group (its world matrix, copied when it is drawn)
    const ssh = emapScanShaders();
    scanMat = new THREE.ShaderMaterial({
      uniforms: { uOn: uniforms.uOn, uCover: { value: 0 }, uHeat: { value: 1 }, uInflate: { value: look.scanInflateMm }, uBase: { value: storms.base }, uSt0: uniforms.uSt0, uSt1: uniforms.uSt1, uAct: { value: storms.act }, uNSt: uniforms.uNSt, uNAct: { value: 0 },
        nsGapCut: { value: new THREE.Vector4(...brainGapUniformValue()) } },
      vertexShader: ssh.vertexShader, fragmentShader: ssh.fragmentShader, transparent: true, depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth, toneMapped: false, side: THREE.FrontSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
    });
    stripKeep(scanMat);
    // (a depth pass of the same copy first: where pieces of the brain meet or lie close behind one another, their pushed
    // out copies overlapped and the colour was laid on twice, a bright seam along every gyrus; now only the nearest
    // layer is coloured, the colour pass testing for the same depth)
    const scanDepthMat = new THREE.ShaderMaterial({ uniforms: { ...scanMat.uniforms, uHeat: { value: 0 } }, vertexShader: ssh.vertexShader, fragmentShader: ssh.depthFragmentShader,
      colorWrite: false, depthWrite: true, depthTest: true, depthFunc: THREE.LessEqualDepth, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      // (transparent, so that it is drawn after the strip's own depth pass, not before it with the opaque things: at the
      // strip's rim a still copy raced the beating strip for the depth and the rim shimmered, a second checker measured)
      transparent: true });
    stripKeep(scanDepthMat);
    scanDepthMats.push(scanDepthMat);
    const surfaces = scanSurfaces(THREE, objects);
    scanDiag = surfaces.diag || null;
    for (const { geo: sg, own } of surfaces) {
      const dm = new THREE.Mesh(sg, scanDepthMat);
      dm.name = 'ns-electrical map, the live scan (depth pass)';
      dm.frustumCulled = false; dm.matrixAutoUpdate = false; dm.renderOrder = look.orderScan - 0.1; dm.visible = false; dm.raycast = () => {};
      dm.onBeforeRender = () => { dm.matrixWorld.copy(objects.brainGroup.matrixWorld); };
      scene.add(dm); scanMeshes.push(dm);
      const m = new THREE.Mesh(sg, scanMat);
      m.name = 'ns-electrical map, the live scan on the brain (made-up activity drawn like a brain scan; not a recording)';
      m.frustumCulled = false; m.matrixAutoUpdate = false; m.renderOrder = look.orderScan; m.visible = false; m.raycast = () => {};
      m.onBeforeRender = () => { m.matrixWorld.copy(objects.brainGroup.matrixWorld); };
      scene.add(m); scanMeshes.push(m);
      if (own) scanOwnGeo.push(sg);
    }
    armBone = new Array(model.palette.armSegs.length).fill(null);
    for (const b of objects.bones || []) { const i = model.palette.armSegs.indexOf(b.segment); if (i >= 0 && !armBone[i] && b.mesh) armBone[i] = b.mesh.matrix.elements; }
  }

  /** The palette: the big brain; then the mirror body's segments and its arm's; then your own. */
  function writePalette(renderer) {
    if (!built || !pal || error) return;
    // (this runs inside the game's own draw: a failure here must switch the map off, never stop the picture)
    try { writePaletteNow(renderer); } catch (err) { error = String((err && err.message) || err); want = false; amount = 0; hideAll(); }
  }
  function writePaletteNow(renderer) {
    const t0 = performance.now();
    const P = model.palette, nB = P.bodySegs.length, nA = P.armSegs.length;
    pal.set(objects.brainGroup.matrixWorld.elements, 0);
    const mb = objects.mirrorBodyGroup.matrixWorld.elements, ob = objects.bodyGroup.matrixWorld.elements, oa = objects.armGroup.matrixWorld.elements;
    tmpArm.multiplyMatrices(objects.mirrorArmGroup.matrixWorld, objects.armGroup.matrix);
    const ma = tmpArm.elements;
    for (let i = 0; i < nB; i++) {
      const m = segs ? segs.get(P.bodySegs[i]) : null;
      mul4Into(pal, 16 * (1 + i), mb, m || ident);
      mul4Into(pal, 16 * (1 + P.stride + i), ob, m || ident);
    }
    for (let j = 0; j < nA; j++) {
      const m = armBone[j] || ident;
      mul4Into(pal, 16 * (1 + nB + j), ma, m);
      mul4Into(pal, 16 * (1 + P.stride + nB + j), oa, m);
    }
    // (uploaded only when a matrix changed: a still view with the map on sends nothing to the graphics card but the clock)
    let same = palKept !== null;
    if (same) for (let i = 0; i < pal.length; i++) if (pal[i] !== palKept[i]) { same = false; break; }
    if (!same) { if (palKept === null) palKept = new Float32Array(pal.length); palKept.set(pal); palTex.needsUpdate = true; palWrites++; }
    const rt = renderer.getRenderTarget ? renderer.getRenderTarget() : null;
    if (rt) size.set(rt.width, rt.height); else renderer.getDrawingBufferSize(size);
    uniforms.uRes.value.copy(size);
    uniforms.uPx.value = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
    lastPalMs = performance.now() - t0; sumPalMs += lastPalMs;
  }

  function setOn(on) { want = Boolean(on) && !error; return want; }

  /** The link's muscles as the model's indices (made once per link and again only when its muscles change). */
  function linkEntry(l) {
    let h = 17;
    const body = l.bodyMeshIds, ak = l.armMuscleKeys, an = l.armMuscleNames;
    if (Array.isArray(body)) for (let i = 0; i < body.length; i++) h = hashNames(h, String(body[i])); else if (body) for (const id in body) h = hashNames(h, id);
    if (Array.isArray(ak)) for (let i = 0; i < ak.length; i++) h = hashNames(h, String(ak[i])); else if (ak) for (const k in ak) h = hashNames(h, k);
    if (Array.isArray(an)) for (let i = 0; i < an.length; i++) h = hashNames(h, String(an[i]));
    let e = linkCache.get(l.key);
    if (e && e.hash === h) return e;
    if (!e) { e = { hash: 0, sig: 0, muscles: new Int32Array(frame.maxMuscles), n: 0 }; linkCache.set(l.key, e); }
    e.hash = h; e.sig = sigNext++; e.n = 0;
    const add = id => { const mi = model.muscleIndex.get(id); if (mi !== undefined && e.n < e.muscles.length) e.muscles[e.n++] = mi; };
    if (Array.isArray(body)) for (const id of body) add(String(id)); else if (body) for (const id in body) if (body[id] > 0) add(id);
    const keys = Array.isArray(ak) ? ak : ak ? Object.keys(ak) : [], names = Array.isArray(an) ? an.map(s => String(s).toLowerCase()) : [];
    if (keys.length || names.length) for (const m of objects.muscles) {
      const nm = m.lname !== undefined ? m.lname : String((m.mesh && m.mesh.name) || '').toLowerCase();
      if ((m.key !== null && m.key !== undefined && keys.includes(m.key)) || names.some(q => nm.includes(q))) add(m.id);
    }
    return e;
  }

  /** Every mesh of the map hidden (after a failure: the game goes on without the map). */
  function hideAll() { for (const m of [front, frontNet, hidden, dimMesh, ...scanMeshes]) if (m) m.visible = false; }
  function frameStep(f) {
    if (!built || error) return 0;
    // (a throw inside the step would leave the dark ground and a frozen map on the screen for the session: it switches
    // the map off and hides it instead, as a failure in the palette does; 22 November 2026, after a checker)
    try { return frameStepNow(f); } catch (err) { error = String((err && err.message) || err); want = false; amount = 0; hideAll(); return 0; }
  }
  function frameStepNow(f) {
    const nowMs = f.nowMs, dt = Number.isFinite(lastMs) ? Math.max(0, Math.min(100, nowMs - lastMs)) / 1000 : 0;
    lastMs = nowMs;
    const reduced = f.reduced === true;
    const target = want ? 1 : 0;
    if (amount !== target) amount = reduced ? target : target > amount ? Math.min(1, amount + dt / o.easeS) : Math.max(0, amount - dt / o.easeS);
    const show = amount > 0;
    if (front.visible !== show) { front.visible = show; frontNet.visible = show; hidden.visible = show; dimMesh.visible = show; }
    { const sv = show && objects.brainGroup.visible; for (const m of scanMeshes) if (m.visible !== sv) m.visible = sv; }
    if (!show) { if (st.active || st.sparks) reset(); clock0 = NaN; return 0; }
    // the scan wholly on: its depth pass before the glass (the glass is not drawn under it; screened colour); easing in
    // or out: after the glass, and its colour covers the glass by the amount (no step at either end)
    const full = amount >= 1;
    if (full !== scanFull && scanMat) {
      scanFull = full;
      for (let i = 0; i < scanMeshes.length; i += 2) scanMeshes[i].renderOrder = full ? look.orderScanDepth : look.orderScan - 0.1;
      scanMat.blendDst = full ? THREE.OneMinusSrcColorFactor : THREE.OneMinusSrcAlphaFactor;
    }
    if (scanMat) scanMat.uniforms.uCover.value = full ? 0 : amount;
    const t0 = performance.now();
    if (!Number.isFinite(clock0)) { clock0 = nowMs; restartStorms(storms); } // (the map's clock starts at 0 again: so do the storms' own)
    if (f.segments) segs = f.segments;
    frame.now = (nowMs - clock0) / 1000; frame.reduced = reduced; frame.nLinks = 0; frame.nLit = 0;
    const links = f.links, marks = f.marks, sources = f.sources;
    if (Array.isArray(links)) for (let i = 0; i < links.length && frame.nLinks < frame.maxLinks; i++) {
      const l = links[i];
      if (!l || typeof l.regionId !== 'string' || !(l.level > 0.02)) continue;
      const ai = model.areaIndex.get(l.regionId);
      if (ai === undefined) continue;
      const e = linkEntry(l), L = frame.links[frame.nLinks++];
      L.area = ai; L.action = typeof l.actionId === 'string' ? l.actionId : null; L.level = l.level > 1 ? 1 : l.level; L.hint = l.hover === true || l.reverse === true; L.sig = e.sig; L.n = e.n;
      for (let k = 0; k < e.n; k++) L.muscles[k] = e.muscles[k];
      // an activation (a look or a click) sends a front each time; a movement the player makes joins the light there is
      L.pulse = false;
      if (Array.isArray(sources)) for (let k = 0; k < sources.length; k++) { const q = sources[k]; if (q && q.key === l.key) { L.pulse = q.source === 'look' || q.source === 'click'; break; } }
      L.restart = false;
      if (Array.isArray(marks) && L.action !== null) for (let k = 0; k < marks.length; k++) if (marks[k] && marks[k].actionId === L.action) { L.restart = true; break; }
    }
    const areas = f.areas;
    if (Array.isArray(areas)) for (let i = 0; i < areas.length && frame.nLit < frame.lit.length; i++) {
      const a = areas[i];
      if (!a || a.links > 0 || !(a.level > 0.02)) continue;
      const ai = model.areaIndex.get(a.regionId);
      if (ai === undefined) continue;
      const q = frame.lit[frame.nLit++]; q.area = ai; q.level = a.level > 1 ? 1 : a.level;
    }
    lit = emapStep(model, st, frame);
    // part 3: a new volley starts a storm on its block (its links fire, its regions flare); the storms and the scan's
    // sources for this frame (ns-emap-storm; the shaders read the arrays as they are)
    for (let i = 0; i < o.slots - o.sparkSlots; i++) {
      const s = st.slots[i];
      if (s.mode !== EMAP_MODE.area || s.hint || s.area < 0) { keptT0[i] = NaN; continue; }
      if (keptT0[i] === s.t0) continue;
      keptT0[i] = s.t0;
      const rec = model.areas[s.area];
      if (!reduced && rec.region >= 0) stormAt(storms, frame.now, rec.region, rec.centre, EMAP_STORM.area, { send: true, cord: false, fadeS: 1.4 });
    }
    {
      const la = typeof f.lookArea === 'string' ? model.areaIndex.get(f.lookArea) : undefined;
      // the eye in the brain's millimetres (storms start on the side the player sees)
      let eye = null;
      if (objects.camera && objects.camera.matrixWorld) { invBrain.copy(objects.brainGroup.matrixWorld).invert(); eyeLocal.setFromMatrixPosition(objects.camera.matrixWorld).applyMatrix4(invBrain); eyeArr[0] = eyeLocal.x; eyeArr[1] = eyeLocal.y; eyeArr[2] = eyeLocal.z; eye = eyeArr; }
      stormOpts.lookRegion = la !== undefined ? model.areas[la].region : -1; stormOpts.reduced = reduced; stormOpts.eye = eye;
      stepStorms(storms, frame.now, stormOpts);
    }
    stormActs(storms, model, st, frame.now);
    uniforms.uNSt.value = storms.nOn;
    if (scanMat) scanMat.uniforms.uNAct.value = storms.nAct;
    if (st.wireDirty) { wireTex.needsUpdate = true; st.wireDirty = false; }
    if (st.slotDirty) { slotTex.needsUpdate = true; st.slotDirty = false; }
    // the resting wiring steps back while a route is lit
    { const want = st.maxLevel > 0 ? Math.min(1, st.maxLevel) : 0; focus = reduced || !(dt > 0) ? want : focus + (want - focus) * (1 - Math.exp(-dt / (want > focus ? look.focusInS : look.focusOutS))); if (Math.abs(want - focus) < 0.004) focus = want; }
    uniforms.uIdle.value = look.idleGain * (1 - look.focusDim * focus);
    uniforms.uTraffic.value = reduced ? 0 : EMAP_STORM.traffic.gain * (1 - look.focusDim * focus);
    uniforms.uTime.value = frame.now;
    uniforms.uOn.value = amount;
    uniforms.uReduced.value = reduced ? 1 : 0;
    const head = Number.isFinite(f.headInPlace) ? f.headInPlace : 0;
    uniforms.uShow.value.set(objects.brainGroup.visible ? 1 : 0, segs && objects.mirrorRoot.visible ? 1 : 0, segs ? 1 : 0, head);
    dimMesh.material.uniforms.uAlpha.value = o.dim * amount;
    framesOn++;
    lastStepMs = performance.now() - t0; sumStepMs += lastStepMs;
    return lit;
  }
  /** Everything dark again and the clock at rest (the map was switched off, or the game was reset). */
  function reset() {
    if (!built) return;
    st.wireTex.fill(0); st.slotTex.fill(0);
    for (const s of st.slots) { s.mode = 0; s.area = -1; s.nWires = 0; s.nSigs = 0; s.level = 0; s.target = 0; s.seen = false; s.wasSeen = false; s.hint = false; }
    st.areaSlot.fill(-1); st.active = 0; st.maxLevel = 0; st.sparks = 0; st.lastNow = NaN; st.nextSparkAt = 0; focus = 0;
    if (storms) { restartStorms(storms); storms.storm0.fill(0); storms.storm2.fill(0); for (let k = 0; k < storms.slots.length; k++) { storms.storm1[4 * k] = 0; storms.storm1[4 * k + 1] = 0; storms.storm1[4 * k + 2] = -1; storms.storm1[4 * k + 3] = -1; } storms.act.fill(0); }
    if (keptT0) keptT0.fill(NaN);
    wireTex.needsUpdate = true; slotTex.needsUpdate = true;
  }

  function state() {
    const v = built ? emapLastVolley(model, st) : null;
    return {
      on: want, amount: Math.round(amount * 1000) / 1000, built, error, standIn: built ? model.standIn : null,
      lines: built ? model.counts.wires : 0, nodes: built ? model.counts.nodes : 0, marks: built ? model.counts.dots : 0, vertices: built ? model.vertexCount : 0,
      activeRoutes: built ? st.active : 0, sparks: built ? st.sparks : 0, volleys: built ? st.volleys : 0, dropped: built ? st.dropped : 0,
      lastVolley: v ? { area: v.area, movement: v.movement, muscle: v.muscle, stations: v.stations.slice(), arrivalS: v.arrivalS } : null,
      slow: built ? { command: Math.round(model.slow.command * 100) / 100, report: Math.round(model.slow.report * 100) / 100, speedMmS: Math.round(model.speedMmS), longestMm: Math.round(model.longest.mm) } : null,
      build: { ms: Math.round(buildMs * 10) / 10, slices: buildSlices, warnings: built ? model.warnings.slice(0, 8) : [] },
      frames: framesOn, paletteWrites: palWrites, stepMs: Math.round(lastStepMs * 1000) / 1000, paletteMs: Math.round(lastPalMs * 1000) / 1000,
      // (the map's own processor time per frame while on, averaged since the start: the state machine and the palette)
      meanMs: framesOn > 0 ? { step: Math.round(sumStepMs / framesOn * 1000) / 1000, palette: Math.round(sumPalMs / framesOn * 1000) / 1000 } : null, drawn: Boolean(front && front.visible), bodyPosed: Boolean(segs),
      // part 3: the live scan and the storms (made-up activity): how many storms are alive, started in all, carried on
      // by a front, sent down the cord; the scan's surfaces; the network's regions and fibres
      scan: built && storms ? { surfaces: scanMeshes.length / 2, drawn: scanMeshes.some(m => m.visible), regions: storms.regions.length, links: storms.links.length, netWires: model.netWires ? model.netWires.length : 0,
        triangles: scanMeshes.filter((m, i) => i % 2 === 1).reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count / 3 : 0), 0), stripKept: dimMesh ? dimMesh.material.stencilFunc === THREE.NotEqualStencilFunc : false,
        stripLeftOut: scanOwnGeo.length > 0, glass: scanDiag,
        storms: storms.slots.filter(q => q.on).length, started: storms.started, flares: storms.minorStarted, hops: storms.hopsStarted, cordVolleys: storms.cordVolleys, activations: storms.nAct } : null
    };
  }
  function dispose() {
    for (const m of [front, frontNet, hidden, dimMesh]) if (m) { scene.remove(m); if (m.material) m.material.dispose(); }
    for (const m of scanMeshes) scene.remove(m);
    scanMeshes.length = 0;
    if (scanMat) scanMat.dispose();
    for (const mt of scanDepthMats) mt.dispose();
    scanDepthMats.length = 0;
    // (the copy's own geometry shares the glass's points and normals: they are taken off it first, so that disposing it
    // frees only its own index and never the glass's buffers)
    for (const g of scanOwnGeo) { for (const name of Object.keys(g.attributes)) g.deleteAttribute(name); g.dispose(); }
    scanOwnGeo.length = 0; scanMat = null;
    if (dimMesh) dimMesh.geometry.dispose();
    if (geo) geo.dispose();
    for (const t of [palTex, wireTex, slotTex]) if (t) t.dispose();
    front = frontNet = hidden = dimMesh = null; built = false; steps = null;
  }
  return { prepare, work, setOn, frame: frameStep, reset, state, dispose, get built() { return built; }, get on() { return want; }, get amount() { return amount; }, get model() { return model; } };
}
