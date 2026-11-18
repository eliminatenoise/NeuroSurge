/**
 * The painted look of the bodies (ns-flesh): the fibre frame a muscle carries and the shader text of the look.
 *
 * These are checks on numbers and on shader text. Nothing is drawn, so they cannot show what the picture looks like.
 *
 * Run: node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_FLESH, FIBRE_PACK, fibreFrame, fibreAcross, fibreAcrossOf, fibreRadiusCode, fibreRadiusOfCode, fleshFibreGlsl, fleshLightGlsl, BODY_DEPTH_PREFERENCE, depthPreferenceFootprint, depthPreferenceAttr } from '../scene/src/ns-flesh.mjs';
import { OUTLINE } from '../scene/src/ns-outline.mjs';
import { patchComicShaders, patchMuscleLookShaders, fibreAxis } from '../scene/src/ns-scene-three.mjs';
import * as THREE from '../vendor/three.module.js';

/** A tube along z, `len` mm long, whose radius goes from r0 at z = 0 to r1 at z = len (rings x segments vertices). */
function tube(len, r0, r1, rings = 40, segs = 24) {
  const p = [];
  for (let i = 0; i < rings; i++) {
    const z = len * i / (rings - 1), r = r0 + (r1 - r0) * i / (rings - 1);
    for (let j = 0; j < segs; j++) { const a = 2 * Math.PI * j / segs; p.push(r * Math.cos(a) + 3, r * Math.sin(a) - 2, z); }
  }
  return new Float32Array(p);
}

test('the fibre frame of a round belly: the fibre number is the arc round it, the same in every slice, so fibres converge where it narrows', () => {
  const pos = tube(200, 30, 12), axis = fibreAxis(pos, 1);
  assert.ok(axis && Math.abs(Math.abs(axis[2]) - 1) < 1e-3, 'the long axis is the tube\'s');
  const fr = fibreFrame(pos, axis);
  assert.ok(fr && fr.attr.length === 4 * pos.length / 3);
  assert.ok(fr.typicalRadiusMm > 15 && fr.typicalRadiusMm < 30);
  assert.ok(fr.roundness > 0.95 && fr.round === 1, 'a tube is round');
  // one vertex column (the same angle round the tube) carries the same fibre number in the broad slice and in the
  // narrow one, although the tube's own radius there is 26 mm and 14 mm
  for (const j of [1, 4, 9, 14, 20]) {
    const a0 = fibreAcross(fr.attr, 8 * 24 + j).across, a1 = fibreAcross(fr.attr, 35 * 24 + j).across;
    assert.ok(Math.abs(a0 - a1) < 0.06 * fr.typicalRadiusMm, `column ${j}: ${a0} vs ${a1}`);
  }
  // the fibre numbers span half the girth at the typical radius (one flank to the other, the same front and back)
  let lo = Infinity, hi = -Infinity, alo = Infinity, ahi = -Infinity;
  for (let i = 0; i < pos.length / 3; i++) {
    const q = fibreAcross(fr.attr, i);
    lo = Math.min(lo, q.across); hi = Math.max(hi, q.across); alo = Math.min(alo, q.along); ahi = Math.max(ahi, q.along);
    assert.ok(fr.attr[4 * i + 3] > 0, 'every vertex is marked as carrying a frame');
  }
  assert.ok(Math.abs(fr.radiusMm / fr.typicalRadiusMm - 1) < 0.11, 'the packed radius is the typical radius to a tenth');
  assert.ok(Math.abs((hi - lo) - Math.PI * fr.radiusMm) < 0.05 * Math.PI * fr.radiusMm, `span ${hi - lo}`);
  assert.ok(ahi - alo > 195 && ahi - alo < 205, 'along the muscle: millimetres');
  for (const v of fr.attr) assert.ok(Number.isFinite(v));
});

test('the fibre frame of a broad thin sheet: the fibre number is the place along its width, and a fan converges', () => {
  // a sheet 200 long, 4 thick, a little uneven, 120 wide at one end and 40 at the other (a fan)
  const p = [];
  for (let i = 0; i < 40; i++) for (let j = 0; j < 30; j++) for (const k of [-1, 1]) { const half = 60 - 40 * i / 39; p.push(-half + 2 * half * j / 29, k * 2 + 0.4 * Math.sin(i * 1.7 + j), 200 * i / 39); }
  const pos = new Float32Array(p), fr = fibreFrame(pos, fibreAxis(pos, 1));
  assert.ok(fr);
  assert.ok(fr.roundness < 0.2 && fr.round === 0, `a sheet is not round (${fr.roundness})`);
  const at = (i, j, k) => fibreAcross(fr.attr, (i * 30 + j) * 2 + k).across;
  // the unevenness of the thickness does not move the fibre number (the comic ink's angle swung with it)
  for (const j of [0, 7, 15, 22, 29]) assert.ok(Math.abs(at(20, j, 0) - at(20, j, 1)) < 0.5, 'front and back of the sheet carry the same fibre');
  // the same share of the width is the same fibre at the broad end and at the narrow end: the fan converges
  for (const j of [0, 7, 22, 29]) assert.ok(Math.abs(at(4, j, 0) - at(34, j, 0)) < 0.12 * Math.abs(at(4, j, 0)) + 0.5, `column ${j}: ${at(4, j, 0)} vs ${at(34, j, 0)}`);
  // and the fibre number runs steadily across the width
  for (let j = 1; j < 30; j++) assert.ok((at(20, j, 0) - at(20, j - 1, 0)) * Math.sign(at(20, 29, 0) - at(20, 0, 0)) > 0);
});

test('the four numbers of the fibre frame are straight-line functions of the position (exact on a coarse mesh)', () => {
  // the middle of an edge of the tube carries the mean of its two ends' numbers (but for the centre line's bend)
  const pos = tube(200, 30, 12, 6, 24), fr = fibreFrame(pos, fibreAxis(pos, 1));
  const mid = new Float32Array(pos.length + 3);
  mid.set(pos); for (let k = 0; k < 3; k++) mid[pos.length + k] = (pos[3 * 24 + 3 * 5 + k] + pos[3 * 48 + 3 * 5 + k]) / 2;
  const fm = fibreFrame(mid, fibreAxis(pos, 1));
  const n = pos.length / 3;
  for (const c of [0, 1, 3]) assert.ok(Math.abs(fm.attr[4 * n + c] - (fm.attr[4 * (24 + 5) + c] + fm.attr[4 * (48 + 5) + c]) / 2) < 0.02 * (c === 3 ? 1 : fr.typicalRadiusMm), `number ${c}`);
});

test('a long curved strap: the fibres run along it everywhere (no chevrons across it, no rings)', () => {
  // an S-shaped strap, 400 mm long, 30 x 18 mm across (like sartorius): its centre swings 35 mm to either side.
  // The checker's finding, 18 November: on such a muscle the fibre lines ran ACROSS it in scalloped chevrons, because
  // the centre line was a parabola (it left the muscle) and the fibre number was the arc |N| x angle.
  const rings = 60, segs = 24, p = [];
  const cx = z => 35 * Math.sin(2 * Math.PI * z / 400), cy = z => 12 * Math.sin(2 * Math.PI * z / 400 + 1.1);
  for (let i = 0; i < rings; i++) {
    const z = 400 * i / (rings - 1);
    for (let j = 0; j < segs; j++) { const a = 2 * Math.PI * j / segs; p.push(cx(z) + 15 * Math.cos(a), cy(z) + 9 * Math.sin(a), z); }
  }
  const pos = new Float32Array(p), fr = fibreFrame(pos, fibreAxis(pos, 1));
  assert.ok(fr && fr.centreFit < 0.35, `the centre line follows the strap (${fr.centreFit})`);
  // one column of vertices (the same place round the strap) is ONE fibre: its number changes along the whole muscle
  // by far less than it changes from that column to the next but two. (With the parabola and the arc it changed by
  // more than the whole girth.)
  const at = (i, j) => fibreAcross(fr.attr, i * segs + j).across;
  let worst = 0, across = 0;
  for (const j of [1, 2, 3, 4, 8, 9, 10, 14, 15, 16, 20, 21, 22]) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 3; i < rings - 3; i++) { const v = at(i, j); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    worst = Math.max(worst, hi - lo);
    across += Math.abs(at(30, j) - at(30, (j + 3) % segs)) / 13;
  }
  assert.ok(across > 0.2 * fr.radiusMm, `the number does change across the strap (${across})`);
  assert.ok(worst < 0.6 * across, `along one fibre the number moves ${worst.toFixed(2)}, between fibres ${across.toFixed(2)}`);
});

test('the centre line bends only as much as the mesh is fine enough for (no zigzags on a coarse mesh)', () => {
  // the same S-shaped strap cut into 60, 14 and 7 rings: inside one long triangle a bent centre line is off by about
  // (its second derivative) x (the triangle's length) squared / 8, and the fibre lines kink by that at its edges
  const strap = rings => {
    const segs = 24, p = [], idx = [];
    for (let i = 0; i < rings; i++) {
      const z = 400 * i / (rings - 1);
      for (let j = 0; j < segs; j++) { const a = 2 * Math.PI * j / segs; p.push(35 * Math.sin(2 * Math.PI * z / 400) + 15 * Math.cos(a), 9 * Math.sin(a), z); }
    }
    for (let i = 0; i + 1 < rings; i++) for (let j = 0; j < segs; j++) { const a = i * segs + j, b = i * segs + (j + 1) % segs; idx.push(a, b, a + segs, b, b + segs, a + segs); }
    const pos = new Float32Array(p);
    return fibreFrame(pos, fibreAxis(pos, 1), { indices: new Uint32Array(idx) });
  };
  const fine = strap(60), mid = strap(14), coarse = strap(7);
  assert.equal(fine.centreDegree, FIBRE_PACK.centreDegree, 'a fine mesh takes the full degree');
  assert.ok(mid.centreDegree < fine.centreDegree, `a coarser one a lower degree (${mid.centreDegree})`);
  assert.ok(coarse.centreDegree <= mid.centreDegree && coarse.centreDegree >= FIBRE_PACK.centreFloorDegree, `the coarsest the lowest (${coarse.centreDegree})`);
  assert.ok(fine.centreFit < mid.centreFit + 1e-9, 'the higher degree follows the strap better');
  assert.ok(FIBRE_PACK.kinkMaxMm < FIBRE_PACK.parabolaKinkMaxMm && FIBRE_PACK.kinkMaxMm <= 1, 'a kink stays well under a bundle\'s width');
  assert.ok(FIBRE_PACK.centreGain > 0.05, 'a higher degree must bring the line clearly closer');
});

test('the angle is used only where the centre line lies well inside the muscle (a crescent is drawn as a sheet)', () => {
  // a crescent-shaped cross-section (a head of gastrocnemius: hollow on one side): its middle lies AT its hollow face,
  // and an angle round a line that the surface comes close to turns in arcs and rings round that place
  const p = [], rings = 40, segs = 32;
  for (let i = 0; i < rings; i++) {
    const z = 220 * i / (rings - 1);
    for (let j = 0; j < segs; j++) {
      const a = Math.PI * (j / (segs - 1) - 0.5) * 1.11; // an arc of 200 degrees ...
      for (const r of [22, 14]) p.push(r * Math.cos(a), r * Math.sin(a), z); // ... 8 mm thick: outer and inner face
    }
  }
  const pos = new Float32Array(p), fr = fibreFrame(pos, fibreAxis(pos, 1));
  assert.ok(fr && fr.roundness > 0.45, `the crescent's cross-section is not flat (${fr.roundness})`);
  assert.ok(fr.inside < FIBRE_PACK.insideFrom, `its inner face comes close to the centre line (${fr.inside})`);
  assert.equal(fr.round, 0, 'so it is drawn as a sheet');
  const tubeFr = fibreFrame(tube(200, 30, 12), [0, 0, 1]);
  assert.ok(tubeFr.inside > 0.9 && tubeFr.round === 1, 'a full round belly keeps the angle');
});

test('the typical radius comes through the packing; the angle number does not depend on the distance from the centre line', () => {
  for (const mm of [1.5, 3.7, 10.4, 31.6, 64, 150]) {
    const back = fibreRadiusOfCode(fibreRadiusCode(mm));
    assert.ok(Math.abs(back / mm - 1) < 0.1, `${mm} -> ${back}`);
  }
  assert.equal(fibreRadiusCode(1e9), FIBRE_PACK.radiusCodes); assert.equal(fibreRadiusCode(0), 0);
  // a round belly (roundness level 8 of 8), radius code 13, cone share 1: twice as far from the centre line in the
  // same direction is the same fibre
  const z = 512 + 100 + FIBRE_PACK.roundStep * FIBRE_PACK.roundLevels, w = 1 + FIBRE_PACK.radiusStep * 13;
  const a = fibreAcrossOf(6, 4, z, w), b = fibreAcrossOf(12, 8, z, w);
  assert.ok(Math.abs(a.across - b.across) < 1e-4 && a.round === 1 && Math.abs(a.along - 100) < 1e-9);
  assert.ok(Math.abs(a.radiusMm - fibreRadiusOfCode(13)) < 1e-9);
  // a sheet (level 0): the place along the width over the cone's radius share
  assert.ok(Math.abs(fibreAcrossOf(6, 4, 512 + 100, 0.5 + FIBRE_PACK.radiusStep * 13).across - 12) < 1e-9);
});

test('no fibres where the frame cannot give lengthwise lines; bundles of uneven width and height', () => {
  const src = fleshFibreGlsl('muscle'), F = BODY_FLESH.fibre;
  assert.ok(src.includes(`smoothstep( ${F.capFrom}, ${F.capTo}, nsZla * 0.001 )`), 'none on an end cap');
  assert.ok(src.includes(`smoothstep( ${F.crossFrom}, ${F.crossTo}, abs( dot( nsZgs, nsZga ) )`), 'none where the lines would run across the muscle');
  assert.ok(F.capFrom < F.capTo && F.crossFrom < F.crossTo && F.crossFrom >= 0.7, 'a fan of 45 degrees keeps its fibres');
  const sum = F.widthWaves.reduce((t, w) => t + w.share, 0);
  assert.ok(sum > 0.4 && sum < 0.8, 'uneven widths, but the fibre number never turns back');
  assert.ok(src.includes('nsZp *= nsZw;'), 'the pixel measure follows the squeeze (a squeezed bundle fades before it could shimmer)');
  assert.ok(F.bumpVary[0] < 0.5 && F.bumpVary[1] > 1, 'neighbouring bundles do not stand equally proud');
  assert.ok(src.includes('atan( vNsHatch.x, abs( vNsHatch.y ) + 1e-6 )') && !src.includes('length( vNsHatch.xy )'), 'the angle, not the arc');
});

test('a glowing muscle stays in its area\'s colour: tinted highlight, no warm shadow tint, no clipped channel', () => {
  const src = fleshLightGlsl('muscle', true), G = BODY_FLESH.glowForm;
  assert.ok(src.includes('nsHue = nsEm > 1e-4 ? nsHue / max( nsHue.r, max( nsHue.g, nsHue.b ) ) : vec3( 1.0 );'));
  assert.ok(src.includes('nsSpec = mix( nsSpec, nsHue * nsWet, nsGl );'), 'the highlight takes the glow\'s hue');
  assert.ok(src.includes('vec3( 1.0 ), max( nsT, nsGl ) );'), 'no warm shadow tint on a glowing muscle');
  assert.ok(src.includes(`min( 1.0, ${G.max} / max( max( nsSum.r, max( nsSum.g, nsSum.b ) ), 1e-4 ) )`), 'the whole colour is scaled, no channel clips');
  assert.ok(G.max < 1 && G.lo > 1 && G.lo < 1.6 && G.tint > 0.5 && BODY_FLESH.wet.glowKeep <= 0.5, 'bright in shade but not flat, a small highlight');
  assert.ok(!fleshLightGlsl('bone', false).includes('nsHue'), 'a bone does not glow');
});

test('a degenerate mesh gets no fibre frame', () => {
  assert.equal(fibreFrame(null, [0, 0, 1]), null);
  assert.equal(fibreFrame(new Float32Array(9), [0, 0, 1]), null);
  assert.equal(fibreFrame(tube(200, 30, 6), null), null);
  assert.equal(fibreFrame(new Float32Array(300), [0, 0, 1]), null, 'all vertices in one point');
});

test('the painted look composes on the real muscle and bone shaders and holds no band, sticker or ink code', () => {
  const lib = THREE.ShaderLib.physical;
  const m0 = patchMuscleLookShaders(lib.vertexShader, lib.fragmentShader);
  const muscle = patchComicShaders(m0.vertexShader, m0.fragmentShader, 'muscle');
  const bone = patchComicShaders(lib.vertexShader, lib.fragmentShader, 'bone');
  for (const p of [muscle, bone]) {
    assert.ok(p && typeof p.fragmentShader === 'string');
    const fs = p.fragmentShader;
    assert.ok(!fs.includes('undefined') && !fs.includes('NaN'));
    for (const gone of ['nsLineCov', 'nsB1', 'nsHat', 'nsDot']) assert.ok(!fs.includes(`float ${gone}`), `${gone} is no longer drawn`);
    assert.equal(fs.split('float nsFlFib = 0.5').length - 1, 1, 'the fibre names are declared once');
    assert.ok(fs.indexOf('float nsFlFib = 0.5') < fs.indexOf('#include <lights_fragment_begin>'), 'the fibre bump comes before the lights');
    assert.ok(fs.includes('reflectedLight.directDiffuse = nsCol;'));
  }
  assert.ok(muscle.fragmentShader.includes('nsFibreLevel( vec2( nsZq'), 'a muscle draws fibre bundles');
  assert.ok(muscle.fragmentShader.indexOf('float nsHash3(') < muscle.fragmentShader.indexOf('vec3 nsFibreLevel('), 'the bundle function comes after the hash it calls');
  assert.ok(!bone.fragmentShader.includes('nsZq') && !bone.fragmentShader.includes('nsFibreLevel'), 'a bone draws none');
  // the smooth normal is put back between the lights and the silhouette terms (the crease, the rim)
  for (const fs of [muscle.fragmentShader, bone.fragmentShader]) {
    const lit = fs.indexOf('#include <lights_fragment_end>'), back = fs.indexOf('normal = nsFlN0;');
    assert.ok(lit > 0 && back > lit && back < fs.indexOf('reflectedLight.directDiffuse = nsCol;'));
  }
  assert.ok(muscle.fragmentShader.indexOf('normal = nsFlN0;') < muscle.fragmentShader.indexOf('float nsMOcc'), 'the crease follows the smooth surface');
  // every pow() base is kept at or above zero where it is set
  for (const src of [fleshLightGlsl('muscle', true), fleshLightGlsl('bone', false), fleshFibreGlsl('muscle')]) {
    for (const m of src.matchAll(/pow\(\s*([^,]+),/g)) {
      const base = m[1].trim();
      assert.ok(/^max\(/.test(base) || new RegExp(`float ${base} = max\\(`).test(src), `pow base "${base}"`);
    }
  }
});

test('the look keeps deep shades and light lights, a bright wet highlight, and no detail that could shimmer', () => {
  const o = BODY_FLESH, F = o.fibre;
  assert.ok(o.muscle.deep <= 0.1 && o.muscle.high >= 1.1, 'deep deep shades to light light shades (the comic look had 0.08 and 1.1)');
  assert.ok(o.white.deep >= 0.3, 'a white finger bone does not end in a black point');
  // 19 November 2026 (the owner: "too glossy ... hard to differentiate"): satin, a modest highlight
  assert.ok(o.wet.max > 0.1 && o.wet.max <= 0.35 && o.wet.maxWhite <= 0.35 && o.wet.glint <= 0.15, 'satin: a modest highlight');
  assert.ok(o.white.high + o.wet.maxWhite + o.wet.glint * 0.5 < 1.75 && o.muscle.high + o.wet.max + o.wet.glint < 2.2);
  assert.ok(F.fadeFrom < F.fadeTo && F.fadeTo <= 0.5, 'a level of fibres is gone before its bundles are two pixels wide');
  assert.ok(F.groupMm > F.bundleMm && F.bundleMm > F.strandMm);
  assert.ok(F.maxSlope <= 0.5, 'the bump can never throw the normal over');
  assert.ok(F.viewFrom < F.viewTo && F.bumpViewFrom < F.bumpViewTo && F.bumpViewFrom >= F.viewFrom, 'edge-on, a muscle carries no detail');
  assert.equal(o.rim.film, 0, 'no grey film over a muscle seen edge-on');
  assert.ok(FIBRE_PACK.alongOffset < FIBRE_PACK.roundStep);
});

test('the fibre bump is limited and fades edge-on (the dark blocks on a shoulder seen at a grazing angle)', () => {
  const src = fleshFibreGlsl('muscle');
  assert.ok(src.includes(`min( 1.0, ${BODY_FLESH.fibre.maxSlope} / max( length( nsZg ), 1e-6 ) )`), 'the tilt is clamped');
  assert.ok(src.includes('nsZnv') && src.includes(`smoothstep( ${BODY_FLESH.fibre.bumpViewFrom}, ${BODY_FLESH.fibre.bumpViewTo}, nsZnv )`), 'the bump fades with the viewing angle');
  assert.ok(src.includes('vec3 nsFlN0 = normal;'), 'the smooth normal is kept');
  assert.ok(!/dFd[xy]\( nsZ(sl|sh|pt)/.test(src), 'no screen derivative of the height');
});

test('the sheets of the belly go behind rectus abdominis over the muscle only, and deeper sheets at least as far', () => {
  const P = BODY_DEPTH_PREFERENCE;
  // a muscle pair 60 mm wide at its lower end and 150 mm at its upper end, 300 mm high, about x = 5
  const muscle = [];
  for (let i = 0; i <= 30; i++) { const z = 10 * i, half = 30 + 45 * i / 30; for (const x of [-half, -half / 2, 0, half / 2, half]) muscle.push(5 + x, 20, z); }
  const fp = depthPreferenceFootprint([new Float32Array(muscle)]);
  assert.ok(fp && Math.abs(fp.mid - 5) < 1e-6 && fp.lo === 0 && fp.hi === 300);
  assert.ok(fp.half[0] < fp.half[fp.half.length - 1], 'the footprint is narrower at the lower end');
  // a sheet: a grid over the whole front, 13 mm in front of the muscle
  const sheet = [];
  for (let i = 0; i <= 30; i++) for (let j = -20; j <= 20; j++) sheet.push(5 + 6 * j, 33, 10 * i);
  const pos = new Float32Array(sheet), at = (a, i, j) => a[i * 41 + (j + 20)];
  const outer = depthPreferenceAttr(pos, fp, P.sheets.FJ1452), deep = depthPreferenceAttr(pos, fp, P.sheets['zm-internal-oblique-r']), deepest = depthPreferenceAttr(pos, fp, P.sheets['zm-transversus-abdominis-r']);
  assert.ok(outer && deep && deepest);
  assert.ok(Math.abs(at(outer, 12, 0) + P.pushM) < 1e-6, 'over the middle of the muscle: the full push, away from the eye');
  assert.equal(at(outer, 12, 20), 0, 'well beside the muscle: none');
  assert.equal(at(outer, 28, 0), 0, 'over the muscle\'s upper end (under the chest muscle): none');
  assert.equal(at(outer, 0, 0), 0, 'at the pubic end: none');
  for (let i = 0; i < outer.length; i++) {
    assert.ok(outer[i] <= 0 && outer[i] >= -P.pushM - 1e-9);
    assert.ok(deep[i] <= outer[i] + 1e-9 && deepest[i] <= deep[i] + 1e-9, 'a deeper sheet is pushed at least as far as the one in front of it');
  }
  // a straight ramp: the middle of two neighbouring vertices inside the ramp carries the mean of their values
  assert.equal(depthPreferenceAttr(pos, null, P.sheets.FJ1452), null);
  assert.equal(depthPreferenceAttr(new Float32Array([500, 0, 150]), fp, P.sheets.FJ1452), null, 'a sheet nowhere near the muscle carries nothing');
  assert.ok(P.pushM > 0.01 && P.pushM <= 0.04, 'enough to win at a grazing angle, not enough to show what lies behind the belly wall');
});

test('thin contours round fingers: a bold line round a slim piece is drawn thin; the brain\'s strip keeps its own ink', () => {
  assert.ok(OUTLINE.slimCm > 1.5 && OUTLINE.slimCm < 4, 'a finger is slim, a forearm is not');
  assert.ok(OUTLINE.slimWidth > 0.3 && OUTLINE.slimWidth < 1 && OUTLINE.slimAlpha > 0.5 && OUTLINE.slimAlpha <= 1);
  assert.ok(OUTLINE.boldCss * OUTLINE.slimWidth <= 1.2, 'about one pixel wide');
  assert.deepEqual([...OUTLINE.stripColour].map(v => Math.round(v * 255)), [0x0b, 0x08, 0x09], 'the motor strip\'s line is not restyled with the bodies');
});
