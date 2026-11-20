/**
 * The raw look (20 November 2026; the owner, Message 195: "The new look aesthetic you've provided in the recent most
 * images is good. Apply it. But you need more clear contrast and differentiation between muscle groups"; Message 196:
 * "New look for everything not just body").
 *
 * Checks on the pure parts: the light of the reference pictures (0.25 + 0.75 x |N.L|, back faces 0.6), the shader
 * patch on three.js's own standard and lambert shaders (the scene's lights left out, nothing glossy), the one switch,
 * and the muscle groups: every muscle of the body and of the left game arm has a group, the groups the brief names as
 * neighbours get tones far apart, the tones stay in the rose-red family. Nothing is drawn here.
 *
 * Run: node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { RAW_LOOK, RAW_HOOKS, rawShade, rawLightDir, rawShadeGlsl, patchRawShaders } from '../scene/src/ns-raw-look.mjs';
import { MUSCLE_GROUPS, MUSCLE_GROUP_TONES, MUSCLE_GROUP_LOOK, muscleGroupOf, muscleGroupTone, muscleGroupBaseInto, muscleToneKey, VISITED_RAW, visitedLightnessInto, MUSCLE_STEP, assignMuscleSteps, drawnMuscleLightness, linearOkL } from '../scene/src/ns-colors.mjs';
import { regionalLayerQualification } from '../scene/src/ns-regional-layers.mjs';
import { bodyPacketMuscleName } from '../scene/src/ns-body.mjs';
import { BODY_STYLE, BONE_COLOUR, RAW_OUTLINE, RAW_TENDON_CUT, patchMuscleLookShaders, SCAN_AS_BRAIN, isScanArea, regionDisplayStyle } from '../scene/src/ns-scene-three.mjs';
import { ROOM } from '../scene/src/ns-room.mjs';
import { BRAIN_FLESH_LOOK, BRAIN_FLESH_RAW, cortexFleshGlsl, areaInkUniformValues, BRAIN_INK } from '../scene/src/ns-brain-ink.mjs';
import { ARROW_LOOK_RAW } from '../scene/src/ns-arrows3d.mjs';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('the light of the reference pictures: 0.25 + 0.75 |N.L|, both sides alike, back faces 0.6, in linear light', () => {
  const L = rawLightDir();
  assert.ok(close(Math.hypot(...L), 1, 1e-12));
  assert.ok(close(rawShade(L).shade, 1, 1e-12), 'a surface facing the light: full colour');
  assert.ok(close(rawShade(L.map(v => -v)).shade, 1, 1e-12), 'turned straight away from it: the same (two-sided, as the tool)');
  const side = [L[1], -L[0], 0].map(v => v / Math.hypot(L[0], L[1]));
  assert.ok(close(rawShade(side).shade, 0.25, 1e-12), 'edge-on to the light: the ambient 0.25');
  assert.ok(close(rawShade(L, false).shade, 0.6, 1e-12), 'a back face: 0.6 of it');
  const facing = rawShade([0, 0, 1]);
  assert.ok(close(facing.shade, 0.25 + 0.75 * 0.7 / Math.hypot(0.4, 0.6, 0.7), 1e-12), 'a surface facing the viewer');
  assert.ok(close(facing.linear, Math.pow(facing.shade, RAW_LOOK.gamma), 1e-12), 'linear light: the sRGB shade to the power gamma');
});

test('the raw patch on three.js shaders: no scene light computed, the albedo times the raw shade, nothing specular', () => {
  for (const name of ['physical', 'standard', 'lambert', 'phong']) {
    const S = THREE.ShaderLib[name];
    const fs = S.fragmentShader;
    assert.ok(RAW_HOOKS.lights.every(h => fs.includes(h)), `${name}: three's light includes are there to take out`);
    const p = patchRawShaders(S.vertexShader, fs);
    assert.ok(p, `${name}: the patch applies`);
    for (const h of RAW_HOOKS.lights) assert.ok(!p.fragmentShader.includes(h), `${name}: ${h} is taken out`);
    const at = p.fragmentShader.indexOf(RAW_HOOKS.ao), raw = p.fragmentShader.indexOf('reflectedLight.directDiffuse = diffuseColor.rgb * nsRawK;');
    assert.ok(at >= 0 && raw > at, `${name}: the raw light right after the ao chunk`);
    assert.ok(p.fragmentShader.includes('reflectedLight.directSpecular = vec3( 0.0 );') && p.fragmentShader.includes('reflectedLight.indirectSpecular = vec3( 0.0 );'));
    assert.ok(p.fragmentShader.includes('#include <opaque_fragment>'), `${name}: the colour and alpha patches after it still find their hook`);
    assert.equal(patchRawShaders(p.vertexShader, p.fragmentShader), null, `${name}: never applied twice`);
    assert.equal(p.vertexShader, S.vertexShader);
  }
  assert.equal(patchRawShaders('void main() {}', 'void main() {}'), null, 'no hooks: the material keeps its own light');
  // a review of Body update 59 (Message 203: the activation as bright as possible): a muscle with the power-up patch
  // keeps the HDR boost of its flash, which the comic patches carried
  const S = THREE.ShaderLib.standard;
  const mus = S.fragmentShader.replace('void main() {', 'uniform vec4 nsCharge;\nvoid main() {\n\tvec4 nsPu = vec4( 0.0 );');
  const pm = patchRawShaders(S.vertexShader, mus);
  assert.equal(pm.hdrBoost, true);
  assert.ok(pm.fragmentShader.includes('totalEmissiveRadiance *= 1.0 + nsHdrBoost.x * max( nsPu.x - nsHdrBoost.y, 0.0 );'));
  assert.equal((pm.fragmentShader.match(/uniform vec4 nsHdrBoost;/g) || []).length, 1, 'declared once');
  assert.ok(pm.fragmentShader.indexOf('nsHdrBoost.x') > pm.fragmentShader.indexOf(RAW_HOOKS.ao), 'after the emission is complete');
  const plain = patchRawShaders(S.vertexShader, S.fragmentShader);
  assert.equal(plain.hdrBoost, false); assert.ok(!plain.fragmentShader.includes('nsHdrBoost'), 'none on a material without the power-up');
});

test('the raw shade in GLSL is the same rule, with the power of a number never below zero', () => {
  const g = rawShadeGlsl('k');
  assert.match(g, /^float k = max\( \( 0\.25 \+ 0\.75 \* abs\( dot\( normalize\( normal \), vec3\(/);
  assert.ok(g.includes('gl_FrontFacing ? 1.0 : 0.6'));
  assert.ok(g.includes(`k = pow( k, ${RAW_LOOK.gamma} );`));
  const flat = rawShadeGlsl('k', 'normal', 'vViewPosition', { ...RAW_LOOK, flat: true });
  assert.ok(flat.includes('cross( dFdx( vViewPosition ), dFdy( vViewPosition ) )'), 'flat: one normal per triangle, as the tool');
});

test('one switch: RAW_LOOK.on picks the raw look for the bodies, the bone, the room, the brain, its strip and the arrows', () => {
  assert.equal(BODY_STYLE, RAW_LOOK.on ? 'raw' : 'cel');
  if (!RAW_LOOK.on) return;
  assert.equal(BONE_COLOUR, 0xe8e0cd, "the reference pictures' ivory, RGB 232, 224, 205");
  assert.deepEqual(ROOM.black, RAW_LOOK.room);
  assert.equal(BRAIN_FLESH_LOOK, BRAIN_FLESH_RAW);
  // Message 207 ("And everything should get clear outlines."): the bodies' strong line and silhouette, a lighter inner
  // step, no parting between touching muscles (their tones tell them apart); the strip's and the brain's line; all thin
  assert.ok(RAW_OUTLINE.alpha[0] >= 0.9 && RAW_OUTLINE.alpha[1] >= 0.85 && RAW_OUTLINE.alpha[2] > 0 && RAW_OUTLINE.alpha[2] < RAW_OUTLINE.alpha[1] && RAW_OUTLINE.alpha[3] === 0, 'clear lines on the bodies');
  assert.ok(RAW_OUTLINE.widthsCss[0] <= 2 && RAW_OUTLINE.widthsCss[1] < RAW_OUTLINE.widthsCss[0] && RAW_OUTLINE.taperMin >= 0.5, 'thin, even, and kept on the far body');
  assert.ok(RAW_OUTLINE.colour.every(v => v < 0.06), 'near-black ink');
  assert.ok(RAW_OUTLINE.strip > 0 && RAW_OUTLINE.stripCss > 0 && RAW_OUTLINE.stripCss <= 2, 'a thin dark contour on the motor strip');
  assert.ok(RAW_OUTLINE.brain > 0 && RAW_OUTLINE.brainCss > 0 && RAW_OUTLINE.brainCss <= 2, "the brain's own outline and its eyes'");
  assert.equal(RAW_OUTLINE.occlusion, false, 'no depth shading laid over the bodies');
  // the cortex: the raw light, no wet sheen or glint, the rim only as the held cue
  const c = cortexFleshGlsl([0.6, 1.5, 1.8]);
  assert.ok(c.includes('float nsDif = abs( dot( nsN, nsLk ) );'));
  assert.ok(!c.includes('nsWet') && !c.includes('nsGrad'), 'no gloss, no bump');
  assert.ok(c.includes('max( nsRimOpacity - 0.34, 0.0 )'));
  // the strip's areas: no ink lines, hatching or dark floors; the arrows: no highlight, rim, edge or ink
  const u = areaInkUniformValues(BRAIN_INK, [0.6, 1.5, 1.8]);
  assert.equal(u.nsAInk[1], 0); assert.equal(u.nsAInk2[0], 0); assert.equal(u.nsAInk2[3], 0); assert.equal(u.nsARel2[3], 0); assert.equal(u.nsAFold[0], 0);
  assert.ok(ARROW_LOOK_RAW.raw === true && ARROW_LOOK_RAW.specular === 0 && ARROW_LOOK_RAW.rimLight === 0 && ARROW_LOOK_RAW.edgeDark === 0);
  // Message 207: the tips keep a clear contour in the outlines' own ink
  assert.ok(ARROW_LOOK_RAW.inkAlpha >= 0.9 && ARROW_LOOK_RAW.wallInk > 0 && ARROW_LOOK_RAW.inkCss > 0 && ARROW_LOOK_RAW.inkCss <= 2);
});

// every muscle the game draws: the body's (packs/BODY-RIG.json) and the left game arm's (inputs/MESH-MANIFEST.json)
const rig = JSON.parse(readFileSync(new URL('../packs/BODY-RIG.json', import.meta.url), 'utf8')).rig;
const bodyMuscles = Object.entries(rig.meshSegment).filter(([, i]) => i.kind === 'muscle').map(([id]) => ({ id, name: regionalLayerQualification(id).sourceName || bodyPacketMuscleName(id) }));
const armAssets = JSON.parse(readFileSync(new URL('../inputs/MESH-MANIFEST.json', import.meta.url), 'utf8')).assets;
const armMuscles = (Array.isArray(armAssets) ? armAssets : Object.values(armAssets)).map(e => ({ id: e.element_id, name: regionalLayerQualification(e.element_id).sourceName })).filter(m => m.name);

test('every muscle of the body and of the left game arm belongs to a group, and a left and a right muscle to the same one', () => {
  assert.ok(bodyMuscles.length > 280 && armMuscles.length > 40, `${bodyMuscles.length} body muscles, ${armMuscles.length} arm muscles`);
  const loose = [...bodyMuscles, ...armMuscles].filter(m => muscleGroupOf(m.name) === 'other').map(m => m.name);
  assert.deepEqual(loose, []);
  const byKey = new Map();
  for (const m of [...bodyMuscles, ...armMuscles]) {
    const k = muscleToneKey(m.id, m.name), g = muscleGroupOf(m.name);
    if (byKey.has(k)) assert.equal(byKey.get(k), g, `both sides of ${k}`); else byKey.set(k, g);
  }
  // spot checks the classification must get right (first match wins)
  const want = {
    'Long head of right biceps brachii': 'upperArmFlexors', 'Right brachialis': 'upperArmFlexors', 'Lateral head of left triceps brachii': 'upperArmExtensors',
    'Right brachioradialis': 'forearmExtensors', 'Right extensor pollicis brevis': 'forearmExtensors', 'Right flexor pollicis longus': 'forearmFlexors',
    'Superficial head of right flexor pollicis brevis': 'hand', 'Oblique head of right adductor pollicis': 'hand', 'Abductor digiti minimi of right hand': 'hand',
    'Spinal part of right deltoid': 'shoulder', 'Right teres major': 'shoulder', 'Sternocostal part of right pectoralis major': 'chest', 'Right serratus anterior': 'chest',
    'Right external oblique': 'abdominalWall', 'right serratus posterior inferior': 'back', 'right semispinalis capitis': 'back', 'right iliocostalis lumborum': 'back',
    'Right iliacus': 'hipAndButtock', 'right quadratus femoris': 'hipAndButtock', 'Right rectus femoris': 'thighFront', 'right gracilis': 'thighInner',
    'Short head of right biceps femoris': 'thighBack', 'Right extensor digitorum longus': 'shinFront', 'right fibularis tertius': 'shinFront', 'right fibularis longus': 'shinSide',
    'right tibialis posterior': 'calf', 'right extensor digitorum brevis': 'foot', 'Platysma.l': 'neck', 'Left levator scapulae': 'neck', 'Zygomaticus major muscle.r': 'face'
  };
  for (const [n, g] of Object.entries(want)) assert.equal(muscleGroupOf(n), g, n);
});

const Lof = g => muscleGroupTone(g).oklch[0];
const gap = (a, b) => Math.abs(Lof(a) - Lof(b));
test('neighbouring groups are told apart by a lightness step of one rose red', () => {
  // the pairs the brief names, the weak pairs a judge panel found in the first version (back / triceps, thigh inner /
  // back, shin front / calf, abdominal wall / hip), and the groups that lie side by side in the start picture
  const pairs = [['upperArmFlexors', 'upperArmExtensors'], ['thighFront', 'thighInner'], ['thighFront', 'thighBack'], ['forearmFlexors', 'forearmExtensors'],
    ['chest', 'shoulder'], ['chest', 'abdominalWall'], ['back', 'upperArmExtensors'], ['thighInner', 'thighBack'], ['shinFront', 'calf'], ['abdominalWall', 'hipAndButtock'],
    ['shoulder', 'upperArmFlexors'], ['abdominalWall', 'thighFront'], ['upperArmFlexors', 'thighFront'], ['upperArmFlexors', 'forearmFlexors'], ['upperArmFlexors', 'forearmExtensors'],
    ['shinFront', 'shinSide'], ['calf', 'shinSide'], ['thighBack', 'calf']];
  for (const [a, b] of pairs) assert.ok(gap(a, b) >= 0.14, `${a} / ${b}: OKLCH lightness ${Lof(a)} / ${Lof(b)}`);
  assert.notEqual(MUSCLE_GROUPS.find(g => g.id === 'upperArmFlexors').tone, MUSCLE_GROUPS.find(g => g.id === 'thighFront').tone, 'the upper arm is not the thigh beside it');
  assert.ok(gap('upperArmFlexors', 'upperArmExtensors') >= 0.25, 'the two sides of the upper arm differ the most');
});

test('the tones are the reference rose at steps of lightness: hue 16-32, chroma at least 0.10, no raspberry, mauve or peach', () => {
  const ref = MUSCLE_GROUP_TONES.reference.oklch;
  assert.ok(Math.abs(ref[0] - 0.602) < 0.002 && Math.abs(ref[2] - 24) < 1, 'the reference tone is the pictures RGB 196, 92, 88');
  assert.deepEqual(MUSCLE_GROUP_TONES.rose.oklch, ref, "'rose' is the reference itself");
  for (const g of MUSCLE_GROUPS) assert.ok(MUSCLE_GROUP_TONES[g.tone], `${g.id}: a known tone`);
  for (const t of Object.values(MUSCLE_GROUP_TONES)) {
    const [L, C, h] = t.oklch;
    assert.ok(h >= 16 && h <= 32, `${t.name}: hue ${h}`);
    assert.ok(C >= 0.1 && C <= 0.14 && L >= 0.4 && L <= 0.78, `${t.name}: L ${L}, C ${C}`);
  }
});

test('a used muscle loses only lightness: it keeps its hue and chroma, so it keeps its group', () => {
  const oklab = ([r, g, b]) => {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q, A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q;
    return [L, Math.hypot(A, B), Math.atan2(B, A) * 180 / Math.PI];
  };
  assert.ok(VISITED_RAW.lightness >= 0.8 && VISITED_RAW.lightness < 1, 'milder than the cel look\'s darkening');
  for (const t of Object.values(MUSCLE_GROUP_TONES)) {
    const before = oklab(t.linear), after = oklab(visitedLightnessInto([...t.linear]));
    assert.ok(Math.abs(after[0] - before[0] * VISITED_RAW.lightness) < 1e-6, `${t.name}: lightness x ${VISITED_RAW.lightness}`);
    assert.ok(Math.abs(after[1] - before[1]) < 1e-3 && Math.abs(after[2] - before[2]) < 0.5, `${t.name}: hue and chroma kept (${before[1].toFixed(3)} ${before[2].toFixed(1)} -> ${after[1].toFixed(3)} ${after[2].toFixed(1)})`);
  }
});

test('the faint, wide part of the tendon white is cut in the raw look (no haze over a sheet such as the pectoral)', () => {
  const S = THREE.ShaderLib.physical;
  const cut = patchMuscleLookShaders(S.vertexShader, S.fragmentShader, RAW_TENDON_CUT), plain = patchMuscleLookShaders(S.vertexShader, S.fragmentShader);
  assert.match(cut.fragmentShader, /float nsMTd = smoothstep\( 0\.55\d*, 0\.90*, vNsTendon \)/);
  assert.ok(plain.fragmentShader.includes('clamp( vNsTendon, 0.0, 1.0 ) * nsMuscleTendon.a'));
  assert.ok(RAW_TENDON_CUT[1] <= 0.9, 'the digit sleeves (0.85) and the finger and toe tendons (1) stay white');
});

test('within a group each muscle varies only slightly, the same on both sides; the deep storeys are a little darker', () => {
  const t = muscleGroupTone('thighFront').linear, out = [0, 0, 0];
  const keys = ['rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius', 'sartorius'];
  for (const k of keys) {
    muscleGroupBaseInto('thighFront', k, 'outer', out);
    for (let i = 0; i < 3; i++) assert.ok(out[i] >= t[i] * (1 - MUSCLE_GROUP_LOOK.vary) - 1e-12 && out[i] <= t[i] * (1 + MUSCLE_GROUP_LOOK.vary) + 1e-12, k);
  }
  const a = muscleGroupBaseInto('thighFront', 'vastus lateralis', 'outer', [0, 0, 0]), b = muscleGroupBaseInto('thighFront', 'vastus lateralis', 'outer', [0, 0, 0]);
  assert.deepEqual(a, b);
  const deep = muscleGroupBaseInto('thighFront', 'vastus intermedius', 'deep', [0, 0, 0]), outer = muscleGroupBaseInto('thighFront', 'vastus intermedius', 'outer', [0, 0, 0]);
  assert.ok(deep[0] < outer[0]);
  assert.equal(muscleGroupOf(null), 'other');
  assert.equal(muscleGroupTone('other'), MUSCLE_GROUP_TONES.reference);
});

test('touching muscles take different lightness steps of their group (Message 202), and step away from the group beside them', () => {
  // three muscles of one group that all touch, and a fourth of the neighbouring group touching one of them
  const c = new Map(), add = (a, b, w) => { for (const [x, y] of [[a, b], [b, a]]) { if (!c.has(x)) c.set(x, new Map()); c.get(x).set(y, w); } };
  add('vastus lateralis', 'rectus femoris', 50); add('rectus femoris', 'vastus medialis', 50); add('vastus lateralis', 'vastus medialis', 20); add('vastus medialis', 'gracilis', 40);
  const group = k => (k === 'gracilis' ? 'thighInner' : 'thighFront'), L = g => muscleGroupTone(g).oklch[0];
  const st = assignMuscleSteps(['vastus lateralis', 'rectus femoris', 'vastus medialis', 'gracilis'], c, group, L);
  const q = ['vastus lateralis', 'rectus femoris', 'vastus medialis'].map(k => st.get(k));
  assert.equal(new Set(q).size, 3, `the three heads all differ: ${q}`);
  // (a review of Body update 59: the gaps are those of the lightness DRAWN, drawnMuscleLightness, not tone L + step x stepL)
  const dl = k => drawnMuscleLightness(group(k), null, st.get(k));
  assert.ok(st.worst.same >= 0.06, `touching muscles of one group are drawn clearly apart (${st.worst.same})`);
  const lm = dl('vastus medialis'), lg = dl('gracilis');
  assert.ok(Math.abs(lm - lg) >= 0.15 - 1e-9, `the border muscle keeps the groups apart (${lm.toFixed(3)} / ${lg.toFixed(3)})`);
  assert.equal(st.worst.contacts, 4); assert.equal(st.gaps.length, 4);
  // the drawn lightness is the lightness of the colour drawn: the clamp at maxL and the storey shade included
  const top = drawnMuscleLightness('upperArmFlexors', null, 1), at0 = drawnMuscleLightness('upperArmFlexors', null, 0);
  assert.ok(top - at0 < MUSCLE_STEP.stepL - 0.01, `a step past maxL is short (${(top - at0).toFixed(3)})`);
  assert.ok(Math.abs(drawnMuscleLightness('thighFront', 'deep', 0) - linearOkL(muscleGroupBaseInto('thighFront', 'x', 'deep', [0, 0, 0], undefined, undefined, 0))) < 1e-12);
  assert.ok(drawnMuscleLightness('thighFront', 'deep', 0) < drawnMuscleLightness('thighFront', 'outer', 0) - 0.02, 'a deep muscle is drawn darker');
  assert.ok(Math.abs(linearOkL(MUSCLE_GROUP_TONES.rose.linear) - MUSCLE_GROUP_TONES.rose.oklch[0]) < 0.002, 'linearOkL inverts the tone record');
  // the step moves the lightness only by step x stepL and turns the hue a little; deterministic
  const a = muscleGroupBaseInto('thighFront', 'k', 'outer', [0, 0, 0], undefined, undefined, 1), b = muscleGroupBaseInto('thighFront', 'k', 'outer', [0, 0, 0], undefined, undefined, -1);
  assert.ok(a[0] > b[0] && a[1] > b[1], 'a lighter step is lighter');
  assert.deepEqual([...assignMuscleSteps(['vastus lateralis', 'rectus femoris', 'vastus medialis', 'gracilis'], c, group, L).entries()], [...st.entries()]);
});

test("the strip's inter-effector areas, where no movement is mapped, are a black abyss again (Message 206, after 199)", () => {
  // Message 199 had them drawn as the brain; Message 206: "let's go back to making the non-active parts of the motor
  // strip a black abyss"
  assert.equal(SCAN_AS_BRAIN, false);
  assert.ok(isScanArea({ id: 'rh_scan_middle' }) && isScanArea({ id: 'lh_scan_superior' }) && !isScanArea({ id: 'lh_shoulder' }));
  const o = regionDisplayStyle({ id: 'rh_scan_middle' }, { activity: 0, hovered: true });
  const lum = c => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  assert.ok(lum(o.albedo) < 0.01 && lum(o.emission) < 0.01, `near-black, no light of its own (${o.albedo.map(v => v.toFixed(4))})`);
});
