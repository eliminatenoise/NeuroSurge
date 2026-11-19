/** Seeing into the brain through the gap between its halves (20 November 2026).
 *
 * The owner: "Through the gap, you should be able to peak into the brain's inner structures."
 *
 * WHAT THIS IS. Since section 151 the two cerebral halves are drawn apart (ns-brain-part HEMI_GAP). Looking down into the
 * parting one saw each half's inner wall of cortex and, at the bottom, the parts of the middle. Now each half's CORTEX
 * is cut away next to the gap: within `cutMm` of a half's inner face, along the stretch of the gap where the ventricles
 * lie (fromY .. toY, tapering off at both ends), the half's gyri are not drawn. What the cut lays open is drawn in the
 * colours of an anatomy atlas (the loading picture's ASSEMBLY_TIER_COLOURS): the white matter's inner face cream, the
 * lateral ventricles and the third ventricle pale blue, the deep grey parts grey, the internal capsule a lighter cream,
 * the cortex's own cut a grey-pink. Looking down into the gap one now sees, from the outside in, the cut edge of the
 * cortex, the white matter, the lateral ventricles and, in the middle, the third ventricle over the midbrain. The cut is
 * in the brain's own frame (atlas millimetres), so it turns, rolls and is carried with the brain.
 *
 * HOW. No new mesh and no new draw. The brain surface is ONE merged geometry drawn twice (a depth pre-pass, then the
 * nearest surface shaded as flesh; ns-scene-three). Each vertex gets two numbers (`nsGap`): its half (+1 the left half,
 * -1 the right half, 0 a part of the middle) and its kind (GAP_KIND). Both passes leave out the cortex's fragments inside
 * the cut, so the next surface behind is drawn. The gyri of the atlas are closed meshes; where the cut opens one, its
 * inside (its back face) is seen: it is drawn flat in the cortex's cut colour and lit as the cut plane (the cap trick
 * of a section view; the cap lies at the gyrus's far wall, not on the plane). Only the cortex is cut: the white matter,
 * the ventricles, the internal capsule and the hippocampus are drawn whole, so their smooth faces show, not the ragged
 * section of meshes that, in this atlas, leave much of the inside of a half empty. The inner parts take their colours
 * only inside the opening (and `tintMm` round it): the white matter that shows between two gyri at the side of the
 * brain keeps the flesh, so the brain looks the same from outside wherever there is no cut. The motor strip (both
 * precentral gyri) and the parts of the middle are never cut, so every motor area stays whole and aimable.
 *
 * Not anatomy: the atlas (BodyParts3D) has no thalamus, caudate, putamen or corpus callosum meshes, so the opening shows
 * what the atlas has. Where a half is cut is a display choice; nothing is measured.
 *
 * Pure: no imports of Three.js, no DOM.
 */
import { ASSEMBLY_TIERS, assemblyDepth } from './ns-assembly-order.mjs';
import { HEMI_GAP, hemisphereSideOf } from './ns-brain-part.mjs';

/** The kinds a brain mesh can be (the second number of `nsGap`). FLESH: drawn as before and never cut (the parts of the
 * middle that are outer tissue: the brainstem, the cerebellum, the hypothalamus; and the motor strip). CORTEX: a half's
 * gyri, cut next to the gap, drawn as flesh, their inside drawn in the cut colour. WHITE (the white matter of a half),
 * VENTRICLE, DEEP (the deep grey parts: hippocampus, habenula, pineal) and INNER WHITE (the internal capsule): never
 * cut, drawn in their atlas colours inside the opening (always, for the parts of the middle). */
export const GAP_KIND = Object.freeze({ flesh: 0, cortex: 1, white: 2, ventricle: 3, deep: 4, innerWhite: 5 });

/** The cut and its colours.
 *  on: false draws the brain as before (no cut, no colours).
 *  cutMm: how deep each half is cut from its inner face (atlas mm; the halves are HEMI_GAP.eachMm from the midline).
 *  fromY / toY / taperMm: the cut runs along the gap from fromY to toY (atlas y, mm; +y is the back of the head), where
 *    the ventricles and the middle parts lie, and tapers to nothing over taperMm beyond either end, so the gap keeps
 *    its old edges in front (the frontal lobes, where nothing lies under the gap) and behind (the strip's leg areas).
 *    The cut ends in front of the strip's back edge, where each half still stands the whole HEMI_GAP.eachMm from the
 *    midline (behind it the step eases off: HEMI_GAP.back, when there is one), so the distance from a half's inner face
 *    is the distance from the midline less eachMm wherever anything is cut or coloured.
 *  midlineMm: the atlas midline (x) before the halves were drawn apart.
 *  colours (sRGB 0..1): white, ventricle, deep are the loading picture's ASSEMBLY_TIER_COLOURS (ns-assembly-core; a test
 *    keeps them equal); cortexCut is the cortex's own cut face. */
export const BRAIN_GAP = Object.freeze({
  on: true,
  cutMm: 10, fromY: -128, toY: -62, taperMm: 10,
  midlineMm: -0.6,
  // a cut face is lit as if turned this much toward the viewer (1 = half way): seen edge-on down the gap it would be dark
  capFace: 1.5,
  // inner parts: edge, the share of their colour kept at their outline; depth, the share kept at the deepest; the parts
  // of the middle keep middleGroove of the groove shading (deep down the gap they read as dark maroon otherwise)
  light: Object.freeze({ edge: 0.55, depth: 0.7, middleGroove: 0.35, innerFrom: 0.45, innerTo: 0.8 }),
  // the inner parts of a half take their colour inside the cut and up to tintMm beyond it (fading out over its outer 60 %)
  tintMm: 10,
  colours: Object.freeze({
    white: hexRgb(0xefe4d6), ventricle: hexRgb(0x7fbde6), deep: hexRgb(0xa48a8e), innerWhite: hexRgb(0xf7f1e6), cortexCut: hexRgb(0xc49a98)
  })
});

function hexRgb(h) { return Object.freeze([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]); }

const TIER_KIND = Object.freeze({
  'brain stem': GAP_KIND.flesh, cerebellum: GAP_KIND.flesh, 'motor strip': GAP_KIND.flesh,
  ventricles: GAP_KIND.ventricle, 'deep nuclei': GAP_KIND.deep, 'white matter': GAP_KIND.white,
  'inner cortex': GAP_KIND.cortex, 'outer cortex': GAP_KIND.cortex
});

/** { side, kind } of one brain mesh: its half (ns-brain-part hemisphereSideOf: +1 left, -1 right, 0 middle) and its
 * GAP_KIND, from its atlas name by the loading picture's own tiers (ns-assembly-order assemblyDepth). The motor strip's
 * pieces (a precentral gyrus, or the strip's left-over triangles drawn as surface) are FLESH and never cut. In the white
 * matter tier the internal capsule is INNER WHITE. A mesh of the middle that would be cut is FLESH (it is not in a
 * half). mesh: { name?, positions }. Pure. */
export function brainGapKind(mesh) {
  const name = String((mesh && mesh.name) || '');
  const side = hemisphereSideOf({ name, positions: mesh && mesh.positions });
  if (/precentral|motor-strip|motor strip/i.test(name)) return { side, kind: GAP_KIND.flesh };
  // the hypothalamus and the tuber cinereum lie on the brain's underside, round the chiasm: outer tissue, seen from below
  if (/hypothalamus|tuber cinereum/i.test(name)) return { side, kind: GAP_KIND.flesh };
  const d = assemblyDepth({ kind: 'brain', name });
  const tier = d ? ASSEMBLY_TIERS.brain[d.tier] : 'outer cortex';
  let kind = Object.hasOwn(TIER_KIND, tier) ? TIER_KIND[tier] : GAP_KIND.cortex;
  if (kind === GAP_KIND.white && !/white matter/i.test(name)) kind = GAP_KIND.innerWhite;
  if (!side && gapCutKind(kind)) kind = GAP_KIND.flesh;
  return { side, kind };
}

/** True for the kinds that are cut next to the gap. Pure. */
export const gapCutKind = kind => kind === GAP_KIND.cortex;

/** True when the atlas point p (mm, the parted brain) of a mesh of { side, kind } is inside the cut (not drawn). The
 * same rule as the shaders' (brainGapGlsl). Pure. */
export function brainGapCut(p, { side, kind }, o = BRAIN_GAP) {
  if (!o.on || !side || !gapCutKind(kind)) return false;
  const inner = side * (p[0] - o.midlineMm) - HEMI_GAP.eachMm;
  // outside the cut's run nothing is cut, also where a half stands nearer the midline than eachMm (behind the strip,
  // where its step eases off: HEMI_GAP.back)
  const w = gapWindow(p[1], o);
  return w > 0 && inner < o.cutMm * w;
}

/** How much the atlas point p of a half lies inside the opening (the shaders' nsOpen): 1 within the cut and up to
 * 0.4 tintMm beyond it, falling to 0 at tintMm beyond it; 0 outside the cut's run along the gap. Pure. */
export function brainGapOpen(p, o = BRAIN_GAP) {
  if (!o.on) return 0;
  const w = gapWindow(p[1], o), inner = Math.abs(p[0] - o.midlineMm) - HEMI_GAP.eachMm, lim = o.cutMm * w;
  return w > 0 ? 1 - smooth(lim + 0.4 * o.tintMm * w, lim + o.tintMm * w + 1e-3, inner) : 0;
}

/** The tip's name key (ns-text BRAIN_PARTS) of an inner part seen in the opening, from its atlas name, or null. Pure. */
export function brainGapPartKey(name) {
  const n = String(name || '').toLowerCase();
  if (/white matter/.test(n)) return 'whiteMatter';
  if (/lateral ventricle/.test(n)) return 'lateralVentricle';
  if (/third ventricle/.test(n)) return 'thirdVentricle';
  if (/fourth ventricle/.test(n)) return 'fourthVentricle';
  if (/aqueduct/.test(n)) return 'aqueduct';
  if (/internal capsule/.test(n)) return 'internalCapsule';
  if (/hippocamp/.test(n)) return 'hippocampus';
  if (/pineal/.test(n)) return 'pineal';
  if (/habenula/.test(n)) return 'habenula';
  return null;
}

/** The per-vertex `nsGap` attribute (side, kind) for a list of pieces given as { count (vertices), side, kind }, in
 * order. Pure. */
export function brainGapAttribute(pieces) {
  let n = 0;
  for (const q of pieces) n += q.count;
  const out = new Float32Array(2 * n);
  let at = 0;
  for (const q of pieces) { for (let i = 0; i < q.count; i++) { out[2 * at] = q.side; out[2 * at + 1] = q.kind; at++; } }
  return out;
}

const f = x => (Number.isInteger(x) ? `${x}.0` : `${x}`);
const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const v3 = c => `vec3( ${c.map(x => f(Math.round(lin(x) * 1e5) / 1e5)).join(', ')} )`;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** How much of the cut's depth holds at atlas y (1 between fromY and toY, 0 beyond the tapers). Pure. */
export function gapWindow(y, o = BRAIN_GAP) { return smooth(o.fromY - o.taperMm, o.fromY, y) * (1 - smooth(o.toY, o.toY + o.taperMm, y)); }

/** The uniform the shaders read: nsGapCut = (cutMm, fromY, toY, on). Pure. */
export function brainGapUniformValue(o = BRAIN_GAP) { return [o.cutMm, o.fromY, o.toY, o.on ? 1 : 0]; }

/** GLSL. head: the uniform and nsGapIn( p, g ) (1 inside the cut, else 0) for any stage; vertex / fragment declarations
 * of the attribute and its varyings. Pure. */
export function brainGapGlsl(o = BRAIN_GAP) {
  const head = 'uniform vec4 nsGapCut;\n' +
    `float nsGapIn( vec3 p, vec2 g ) {\n  if ( nsGapCut.w < 0.5 || abs( g.x ) < 0.5 || g.y < 0.5 || g.y > 1.5 ) return 0.0;\n` +
    `  float nsIn = g.x * ( p.x - ( ${f(o.midlineMm)} ) ) - ${f(HEMI_GAP.eachMm)};\n` +
    `  float nsWin = smoothstep( nsGapCut.y - ${f(o.taperMm)}, nsGapCut.y, p.y ) * ( 1.0 - smoothstep( nsGapCut.z, nsGapCut.z + ${f(o.taperMm)}, p.y ) );\n` +
    '  return nsWin > 0.0 && nsIn < nsGapCut.x * nsWin ? 1.0 : 0.0;\n}\n';
  return { head, vertexDecl: 'attribute vec2 nsGap;\nvarying vec2 vNsGap;\n', fragmentDecl: 'varying vec2 vNsGap;\n' };
}

const PROJECT_HOOK = '#include <project_vertex>', MAIN = 'void main() {';

/** The glass shell's vertex shader (ns-scene-three patchGlassReadShaders, after its own patch): passes nsGap on and the
 * cut plane's normal as seen (vNsCapN; nsRigidN under the far-eye picture, as the surface's own normal). null when the
 * hook is missing. Pure. */
export function brainGapShellVertex(vertexShader, o = BRAIN_GAP) {
  if (typeof vertexShader !== 'string' || !vertexShader.includes(PROJECT_HOOK)) return null;
  const g = brainGapGlsl(o);
  return g.vertexDecl + 'varying vec3 vNsCapN;\n' + g.head + vertexShader.replace(PROJECT_HOOK, `${PROJECT_HOOK}\n\tvNsGap = nsGap;\n` +
    '\t{ vec3 nsCapA = vec3( - nsGap.x, 0.0, 0.0 ); vNsCapN = normalize( ( nsFarEye.w > 1.0 ? nsRigidN : normalMatrix ) * nsCapA ); }');
}

/** The glass depth pre-pass (a colour-less MeshBasicMaterial): the same fragments left out as in the shell. null when
 * a hook is missing (the pre-pass then writes the whole surface, and the cut shows nothing). Pure. */
export function patchGapDepthShaders(vertexShader, fragmentShader, o = BRAIN_GAP) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string' || !vertexShader.includes(PROJECT_HOOK) || !fragmentShader.includes(MAIN)) return null;
  const g = brainGapGlsl(o);
  return {
    vertexShader: g.vertexDecl + 'varying vec3 vNsGapP;\n' + vertexShader.replace(PROJECT_HOOK, `${PROJECT_HOOK}\n\tvNsGap = nsGap; vNsGapP = position;`),
    fragmentShader: g.fragmentDecl + 'varying vec3 vNsGapP;\n' + g.head + fragmentShader.replace(MAIN, `${MAIN}\n\tif ( nsGapIn( vNsGapP, vNsGap ) > 0.5 ) discard;`)
  };
}

/** GLSL for the flesh shader (ns-brain-ink cortexFleshGlsl's albedo hook): the kinds' colours, and the flat section
 * colour and cut-plane light of a cap (a back face of a cut kind: seen only through the cut). In scope: nsAlb, nsG, nsN,
 * nsV, nsFacing, vNsGap, vNsCapN (the cut plane's normal as seen). Pure. */
export function brainGapAlbedoGlsl(o = BRAIN_GAP) {
  const c = o.colours, L = o.light;
  return `
	{
		float nsGk = vNsGap.y;
		bool nsHalf = abs( vNsGap.x ) > 0.5;
		bool nsCap = !gl_FrontFacing && nsHalf && nsGk > 0.5 && nsGk < 1.5;
		// how much this point is "inside the opening": 1 within the cut and tintMm beyond it (fading out), 0 elsewhere,
		// so a part of a half seen from outside (white matter between two gyri at the side of the brain) keeps the flesh
		float nsWinY = smoothstep( nsGapCut.y - ${f(o.taperMm)}, nsGapCut.y, vNsObj.y ) * ( 1.0 - smoothstep( nsGapCut.z, nsGapCut.z + ${f(o.taperMm)}, vNsObj.y ) ) * step( 0.5, nsGapCut.w );
		float nsInX = abs( vNsObj.x - ( ${f(o.midlineMm)} ) ) - ${f(HEMI_GAP.eachMm)};
		float nsLim = nsGapCut.x * nsWinY;
		float nsOpen = ( 1.0 - smoothstep( nsLim + ${f(0.4 * o.tintMm)} * nsWinY, nsLim + ${f(o.tintMm)} * nsWinY + 1e-3, nsInX ) ) * step( 1e-4, nsWinY );
		// the cortex's own inside that the cut lays open (its deep faces, far under the brain's hull) is drawn like its cut,
		// not as a dark groove
		float nsT = nsCap ? 1.0 : nsGk > 1.5 ? ( nsHalf ? nsOpen : 1.0 ) : nsGk > 0.5 && nsHalf ? nsOpen * smoothstep( ${f(o.light.innerFrom)}, ${f(o.light.innerTo)}, nsG ) : 0.0;
		if ( nsT > 0.0 ) {
			vec3 nsTint = nsGk < 1.5 ? ${v3(c.cortexCut)} : nsGk < 2.5 ? ${v3(c.white)} : nsGk < 3.5 ? ${v3(c.ventricle)} : nsGk < 4.5 ? ${v3(c.deep)} : ${v3(c.innerWhite)};
			if ( nsCap ) { nsN = normalize( vNsCapN ); if ( dot( nsN, nsV ) < 0.0 ) nsN = -nsN; nsN = normalize( nsN + ${f(o.capFace)} * nsV ); nsFacing = max( dot( nsN, nsV ), 0.0 ); }
			// an inner part reads as a body: darker toward its outline and the deeper it lies under the brain's hull
			else nsTint *= mix( ${f(L.edge)}, 1.0, smoothstep( 0.05, 0.75, nsFacing ) ) * mix( 1.0, ${f(L.depth)}, nsG );
			nsAlb = mix( nsAlb, nsTint, nsT );
			nsG *= 1.0 - nsT;
		} else if ( !nsHalf ) {
			// a part of the middle seen deep down the opening (the midbrain, the colliculi) is not shaded as a groove
			nsG *= mix( 1.0, ${f(L.middleGroove)}, nsOpen * step( 0.001, nsWinY ) );
		}
	}
`;
}
