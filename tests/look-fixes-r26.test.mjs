/** Faults of the look from a browser hunt of Body update 62 (21 November 2026, DESIGN-DECISIONS section 187).
 *
 * H14: during a quick circle roll of the brain an eyeball sank into the brain, and the dark outline ring of an eyeball
 * behind the brain was drawn across the brain's surface (in still views too). The eyeballs' vertices were kept about
 * each eye's own centre while the living brain's vertex rule reads a vertex as a rest position in the brain's own
 * millimetres; and the outline's coverage picture had no depth between the brain's surface and the eyes.
 * H25: the whole brain turned lilac or grey-blue while an area was picked (Message 177's faint tint, BRAIN_PICK_TINT):
 * 6 % of the area's saturated glow colour was ADDED to the pale, mostly shaded matte cortex.
 * H27: during a Space grip the forearms turned a flat tan or khaki: the control mark's yellow light (PART_GLOW) added to
 * the darkest rose tones.
 * H28: a raised forearm in shadow went almost black against the room: the raw light's deepest shade (a quarter of the
 * colour, 0.15 on a back face) of the darkest rose tones.
 * H26: a thin grey rod stuck out of the curled right hand: the extensor indicis' tendon over the index finger's middle
 * and distal phalanges, carried by the proximal phalanx (its packet hint ends there), stood straight out of the fist.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAIN_LIVE, createBrainLive, liveMove } from '../scene/src/ns-brain-live.mjs';
import { buildEyeballs } from '../scene/src/ns-brain-eyes.mjs';
import { patchCoverageNear, coverageNearRange, COVERAGE_NEAR_HOOKS } from '../scene/src/ns-outline.mjs';
import { BRAIN_FLESH_LOOK, BRAIN_PICK_LOOK, brainPickGainInto, cortexFleshGlsl } from '../scene/src/ns-brain-ink.mjs';
import { AREA_COLORS, areaGlowColor, srgbToLinear, MUSCLE_GROUP_TONES, MUSCLE_GROUPS, MUSCLE_STEP, MUSCLE_LOOK, muscleGroupBaseInto, linearOkLab } from '../scene/src/ns-colors.mjs';
import { ROOM } from '../scene/src/ns-room.mjs';
import { PART_GLOW, PART_GLOW_RAW, LIMB_FLASH, partGlowColourInto } from '../scene/src/ns-scene-three.mjs';
import { RAW_LOOK, patchRawShaders } from '../scene/src/ns-raw-look.mjs';
import * as THREE from '../vendor/three.module.js';
import fs from 'node:fs';
import { loadPageBody } from '../tools/page-body.mjs';

/* ---- H14: the eyeballs ride the living brain ------------------------------------------------------------------- */

test('H14: an eyeball given in the brain\'s own millimetres moves with the tissue during a turn; about its own centre it was thrown far off', () => {
  const E = buildEyeballs(), c = E.centres.left;
  // the brain's centre a little behind and above the eyes (the atlas's millimetres: the pivot is far from the origin)
  const pivot = [c[0] + 20, c[1] + 40, c[2] + 50];
  const L = createBrainLive({ reducedMotion: false });
  L.wobbling = true; L.a[0] = BRAIN_LIVE.wobble.maxRad; L.a[1] = 0; L.a[2] = BRAIN_LIVE.wobble.maxRad; // the largest turn lag
  const nv = E.positions.length / 6;
  let worstAtlas = 0, worstLocal = 0;
  for (let i = 0; i < nv; i += 7) {
    const p = [E.positions[3 * i], E.positions[3 * i + 1], E.positions[3 * i + 2]];
    worstAtlas = Math.max(worstAtlas, Math.hypot(...liveMove(L, p, pivot)));
    worstLocal = Math.max(worstLocal, Math.hypot(...liveMove(L, [p[0] - c[0], p[1] - c[1], p[2] - c[2]], pivot)));
  }
  // the tissue next to the eyes moves at most the turn lag times its distance from the centre (some 70 mm): a few mm
  assert.ok(worstAtlas < 8, `in the brain's millimetres an eyeball moves a few millimetres (${worstAtlas.toFixed(1)})`);
  assert.ok(worstLocal > 5 * worstAtlas, `about its own centre it was read as a point by the atlas's origin and moved ${worstLocal.toFixed(0)} mm`);
});

/* ---- H14: no outline of an eyeball behind the brain ------------------------------------------------------------ */

const BASIC_VS = 'void main() {\n#include <begin_vertex>\n#include <project_vertex>\n}';
const BASIC_FS = 'void main() {\n\tgl_FragColor = vec4( 1.0 );\n#include <dithering_fragment>\n}';

test('H14: the coverage picture carries the nearness of the brain (a) and of its eyes (b), so an eye counts only in front', () => {
  const p = patchCoverageNear(BASIC_VS, BASIC_FS);
  assert.ok(p, 'a MeshBasicMaterial is patched');
  assert.match(p.vertexShader, /vNsCovZ = - mvPosition\.z;/, 'the view distance after the projection chunk');
  assert.ok(p.vertexShader.indexOf('vNsCovZ = ') > p.vertexShader.indexOf(COVERAGE_NEAR_HOOKS.vertex));
  assert.match(p.fragmentShader, /gl_FragColor = vec4\( nsCov\.x, nsCov\.y, nsCov\.z \* nsN, nsCov\.w \* nsN \);/);
  assert.ok(p.fragmentShader.indexOf('gl_FragColor = vec4( nsCov') > p.fragmentShader.indexOf(COVERAGE_NEAR_HOOKS.fragment), 'written last');
  assert.equal(patchCoverageNear(p.vertexShader, p.fragmentShader), null, 'never twice');
  assert.equal(patchCoverageNear('void main() {}', BASIC_FS), null, 'a missing hook leaves the material as it is');
});

test('H14: the nearness range spans the brain and the eyes in front of it; nearer is larger, never 0 where covered', () => {
  const d = 1.2, r = 0.1, [far, inv] = coverageNearRange(d, r);
  const near = z => (1 + 254 * Math.min(1, Math.max(0, (far - z) * inv))) / 255; // the shader's rule
  assert.ok(near(d - r) > near(d) && near(d) > near(d + r), 'the front of the brain is nearer than its back');
  assert.ok(near(d - 1.3 * r) < 1 && near(d + 1.3 * r) > 1 / 255, 'an eye just beyond the brain\'s bounding sphere is still inside the range');
  assert.ok(near(d + 10) >= 1 / 255 && near(d - 10) <= 1, 'clamped, and a covered sample is never 0 (0 = none)');
  // an eye 2 mm in front of the brain's surface reads as in front at 8 bits (the shader compares the stored bytes)
  const byte = z => Math.round(near(z) * 255);
  assert.ok(byte(d - 0.05 - 0.002) > byte(d - 0.05), 'a step is under 2 mm for a brain of 100 mm radius');
});

/* ---- H25: the brain lights up faintly in the picked colour, never lilac or grey-blue ---------------------------- */

const okOf = c => {
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]), m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]), s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
};
const hueOf = o => Math.atan2(o[2], o[1]) * 180 / Math.PI;
const turn = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return Math.abs(d); };
const crown = BRAIN_FLESH_LOOK.crown.map(srgbToLinear);
const linked = Object.keys(AREA_COLORS).filter(id => !/scan/.test(id));

test('H25: nothing picked, no tint; the tint follows its share', () => {
  assert.deepEqual(brainPickGainInto([9, 9, 9], null, 1), [0, 0, 0]);
  assert.deepEqual(brainPickGainInto([9, 9, 9], areaGlowColor('rh_throat'), 0), [0, 0, 0]);
  const full = brainPickGainInto([0, 0, 0], areaGlowColor('rh_throat'), 1), half = brainPickGainInto([0, 0, 0], areaGlowColor('rh_throat'), 0.5);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(half[i] - full[i] / 2) < 1e-12);
  assert.match(cortexFleshGlsl({ ...BRAIN_FLESH_LOOK }), /nsCol \*= 1\.0 \+ nsPickTint;/, 'the cortex shader takes it as a gain');
});

test('H25: for every area the cortex lights up a little, takes a faint cast of the area\'s hue and stays its own pink', () => {
  for (const shade of [1, 0.35, 0.05]) { // facing the light, half shade, the deepest shade of the matte light
    const ref = crown.map(x => x * shade), o0 = okOf(ref), C0 = Math.hypot(o0[1], o0[2]);
    for (const id of linked) {
      const g = areaGlowColor(id), k = brainPickGainInto([0, 0, 0], g, 1), o1 = okOf(ref.map((x, i) => x * (1 + k[i])));
      const dE = Math.hypot(o1[0] - o0[0], o1[1] - o0[1], o1[2] - o0[2]);
      assert.ok(o1[0] > o0[0], `${id}: lighter (it lights up)`);
      assert.ok(dE < 0.022, `${id}: a faint change (${dE.toFixed(4)} in OKLab)`);
      assert.ok(Math.hypot(o1[1], o1[2]) >= BRAIN_PICK_LOOK.keepChroma * C0 - 1e-9, `${id}: never greyed`);
      assert.ok(turn(hueOf(o1), hueOf(o0)) < 14, `${id}: the hue turns a little (${turn(hueOf(o1), hueOf(o0)).toFixed(1)} degrees), the same in light and shade`);
      const go = okOf(g), toward = (o1[1] - o0[1]) * go[1] + (o1[2] - o0[2]) * go[2];
      assert.ok(toward > 0, `${id}: the cast leans toward the area's own hue`);
    }
  }
});

test('H25: the old added light (6 % of the glow colour) turned the shaded cortex lilac or grey-blue; the gain does not', () => {
  const ref = crown.map(x => x * Math.pow(0.25 + 0.75 * 0.1, 2.2)), o0 = okOf(ref);
  let worstOld = 0, worstNew = 0;
  for (const id of linked) {
    const g = areaGlowColor(id), old = okOf(ref.map((x, i) => x + g[i] * 0.06 * (0.55 + 0.45 * 0.1)));
    const k = brainPickGainInto([0, 0, 0], g, 1), now = okOf(ref.map((x, i) => x * (1 + k[i])));
    worstOld = Math.max(worstOld, turn(hueOf(old), hueOf(o0))); worstNew = Math.max(worstNew, turn(hueOf(now), hueOf(o0)));
  }
  assert.ok(worstOld > 40, `the added light turned the shaded cortex's hue by up to ${worstOld.toFixed(0)} degrees`);
  assert.ok(worstNew < 14, `the gain by at most ${worstNew.toFixed(1)}`);
});

/* ---- H27: a marked limb glows in its own rose red ---------------------------------------------------------------- */

test('H27: a muscle marked by a control glows in its own hue in the raw look; the mark\'s yellow turned the dark tones tan', () => {
  const level = 7 / 12; // a forearm while Space grips (spaceGripGlows: lower 0.583)
  for (const [name, tone] of Object.entries(MUSCLE_GROUP_TONES)) {
    const base = tone.linear, h0 = hueOf(okOf(base));
    for (const shade of [1, 0.3]) {
      const lit = base.map(x => x * shade);
      const old = lit.map((x, i) => x + LIMB_FLASH.colour[i] * PART_GLOW.glow * level);
      const c = partGlowColourInto([0, 0, 0], base, LIMB_FLASH.colour, PART_GLOW_RAW.markShare), now = lit.map((x, i) => x + c[i] * PART_GLOW.glow * level);
      const hNow = turn(hueOf(okOf(now)), h0), hOld = turn(hueOf(okOf(old)), h0);
      assert.ok(hNow < 10, `${name} at shade ${shade}: the lit muscle keeps its rose hue (${hNow.toFixed(1)} degrees off)`);
      assert.ok(okOf(now)[0] > okOf(lit)[0] + 0.02, `${name}: and is plainly lighter (it is lit)`);
      if (name === 'darkest' && shade === 0.3) assert.ok(hOld > 25, `the yellow light turned it ${hOld.toFixed(0)} degrees, toward tan`);
    }
  }
  const c = partGlowColourInto([0, 0, 0], [0.2, 0.02, 0.03], [1, 0.86, 0.42], 0);
  assert.deepEqual(c.map(x => Math.round(x * 1000) / 1000), [1, 0.1, 0.15], 'its own colour at full brightness');
});

/* ---- H28: no muscle goes black on its shaded side ------------------------------------------------------------- */

const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
// the shader's rule. 21 November 2026 (section 188): the game keeps the colours' ratios at the floor (RAW_LOOK
// muscleFloorKeep 1: one floor on the shade, muscleFloor / muscleFloorRef, for every muscle); keep 0 is section 187's floor
// on the luminance, still an option of patchRawShaders.
const floored = (k, base, floor, keep = RAW_LOOK.muscleFloorKeep, ref = RAW_LOOK.muscleFloorRef) => {
  const kf = Math.min(1, keep > 0 ? floor / Math.pow(ref, keep) * Math.pow(Math.max(lum(base), 1e-4), keep - 1) : floor / Math.max(lum(base), 1e-4)), w = 0.5 * kf;
  return Math.min(0.5 * (k + kf + Math.sqrt((k - kf) ** 2 + w * w)), 1);
};

test('H28: the muscles\' raw light has a shade floor; nothing else has one', () => {
  const S = THREE.ShaderLib.standard, fs = '#define STANDARD\n' + S.fragmentShader;
  const plain = patchRawShaders(S.vertexShader, fs), muscle = patchRawShaders(S.vertexShader, fs, RAW_LOOK, { floor: RAW_LOOK.muscleFloor });
  assert.ok(plain && muscle);
  assert.ok(!plain.fragmentShader.includes('nsKf'), 'the brain, the bones, the strip and the room: no floor (the abyss stays black)');
  assert.match(muscle.fragmentShader, /float nsKf = min\( 1\.0, 0\.01 \/ max\( dot\( diffuseColor\.rgb, vec3\( 0\.2126, 0\.7152, 0\.0722 \) \), 1e-4 \) \)/);
  assert.ok(muscle.fragmentShader.indexOf('nsKf') < muscle.fragmentShader.indexOf('reflectedLight.directDiffuse = diffuseColor.rgb * nsRawK'), 'before the light is used');
  // (section 188: the game's muscles keep their colours' ratios at the floor: one floor on the shade, a constant)
  const game = patchRawShaders(S.vertexShader, fs, RAW_LOOK, { floor: RAW_LOOK.muscleFloor, keep: RAW_LOOK.muscleFloorKeep, ref: RAW_LOOK.muscleFloorRef });
  assert.equal(RAW_LOOK.muscleFloorKeep, 1);
  const m = game.fragmentShader.match(/float nsKf = ([0-9.]+), nsKw = 0\.5 \* nsKf;/);
  assert.ok(m && Math.abs(Number(m[1]) - RAW_LOOK.muscleFloor / RAW_LOOK.muscleFloorRef) < 1e-9, 'the floor is muscleFloor / muscleFloorRef on the shade');
});

test('H28 and section 188: every muscle colour the game draws stays dark red above the abyss in its deepest shade; the lit side is kept; a light colour\'s deepest shade is lifted only so far', () => {
  // 22 November 2026 (a check of section 188): the colours tested are those DRAWN (each group, storey, lightness step
  // and warm step: muscleGroupBaseInto with MUSCLE_STEP, the darkest at minL), and the background is section 190's
  // abyss (ns-room ROOM.abyss: its black and the faint glow beside a body, the body's glow at its outline), not the room
  // that is no longer drawn. (Before section 190 is merged on a branch, its numbers as they landed.)
  const abyss = ROOM.abyss && ROOM.abyss.black ? ROOM.abyss : { black: [0.0005, 0.0005, 0.0006], glow: { colour: [0.86, 0.93, 1], mirror: [0.0025, 1, 0], body: [0.0025, 1, 0, 1.4, 2.1] } };
  const glow = Math.max(abyss.glow.mirror[0], abyss.glow.body[0]) * Math.exp(-1);
  const beside = lum(abyss.black.map((v, i) => v + abyss.glow.colour[i] * glow));
  const away = Math.pow(RAW_LOOK.ambient, RAW_LOOK.gamma), backFace = Math.pow(RAW_LOOK.ambient * RAW_LOOK.back, RAW_LOOK.gamma);
  let darkest = Infinity, darkestOf = '';
  for (const g of MUSCLE_GROUPS) for (const level of ['outer', 'intermediate', 'deep']) for (const st of MUSCLE_STEP.steps) for (const w of MUSCLE_STEP.warm.steps) {
    const base = muscleGroupBaseInto(g.id, 'k', level, [0, 0, 0], undefined, undefined, st, MUSCLE_STEP, w), name = `${g.id} ${level} ${st}/${w}`;
    for (const shade of [away, backFace]) {
      const k = floored(shade, base, RAW_LOOK.muscleFloor);
      assert.ok(k <= 1, `${name}: never above its own colour`);
      // the bound on the lift: the deepest shade stays at most 0.18 of the colour (the floor's 0.16 and its soft knee)
      assert.ok(k <= 0.18, `${name}: its deepest shade is ${k.toFixed(3)} of its colour`);
      const y = lum(base) * k;
      if (y < darkest) { darkest = y; darkestOf = name; }
    }
    // red, not pink, grey, mauve or brown, lit and in shade alike (a colour scaled by the light keeps its OKLab chroma over
    // lightness and its hue): hue 10 to 30 degrees; chroma at least 0.115 of the lightness (a pale red with less reads
    // pink, and grey-brown in shade), on a dark colour at least 0.19 (a dark red with less reads mauve). Section 188's
    // first part had the pale 1/-1 at 0.102 and the dark 1/-1 at 0.175.
    const ok = linearOkLab(base), C = Math.hypot(ok[1], ok[2]), h = Math.atan2(ok[2], ok[1]) * 180 / Math.PI;
    assert.ok(h >= 10 && h <= 30, `${name}: hue ${h.toFixed(1)}`);
    assert.ok(C >= (ok[0] < 0.52 ? 0.19 : 0.115) * ok[0], `${name}: chroma ${C.toFixed(3)} at lightness ${ok[0].toFixed(3)}`);
    assert.ok(Math.abs(floored(1, base, RAW_LOOK.muscleFloor) - 1) < 1e-3, `${name}: facing the light, its colour`);
    // and the lift against section 187's floor (on the luminance) where the surface turns away from the light: at most
    // four times the light (the pale tone's light steps about 3.6, the tendon white 3.7: about twice in the screen's numbers)
    assert.ok(floored(away, base, RAW_LOOK.muscleFloor) / floored(away, base, RAW_LOOK.muscleFloor, 0) < 4, `${name}: lifted ${(floored(away, base, RAW_LOOK.muscleFloor) / floored(away, base, RAW_LOOK.muscleFloor, 0)).toFixed(2)} x`);
  }
  assert.ok(darkest > 2.5 * beside, `the darkest muscle in its deepest shade (${darkestOf}) is ${(darkest / beside).toFixed(1)} x the light of the abyss beside a body`);
  const tendon = MUSCLE_LOOK.tendon;
  assert.ok(floored(away, tendon, RAW_LOOK.muscleFloor) / floored(away, tendon, RAW_LOOK.muscleFloor, 0) < 4, 'the tendon white too');
  // 21 November 2026 (section 188, Message 202: "muscles next to each other can be obviously told apart"): with the floor on
  // the luminance every dark muscle met at the same dark red in the deepest shade. Now the darkest tone keeps exactly
  // section 187's floor and every other colour keeps its ratio to it.
  const dk = MUSCLE_GROUP_TONES.darkest.linear;
  assert.ok(Math.abs(RAW_LOOK.muscleFloorRef - lum(dk)) < 2e-4, 'the reference is the darkest tone (muscleFloorRef stays 0.0621)');
  assert.ok(Math.abs(floored(away, dk, RAW_LOOK.muscleFloor) - floored(away, dk, RAW_LOOK.muscleFloor, 0)) < 1e-3, 'the darkest tone keeps section 187\'s floor');
  for (const [name, tone] of Object.entries(MUSCLE_GROUP_TONES)) {
    const a = lum(tone.linear) * floored(away, tone.linear, RAW_LOOK.muscleFloor), b = lum(dk) * floored(away, dk, RAW_LOOK.muscleFloor);
    assert.ok(Math.abs(a / b - lum(tone.linear) / lum(dk)) < 1e-6, `${name}: its ratio to the darkest tone is kept in the deepest shade`);
  }
});

/* ---- H26: no tendon sticks out of the fist -------------------------------------------------------------------- */

test('H26: the extensors that join a finger\'s extensor expansion are skinned along the whole finger', () => {
  const rig = JSON.parse(fs.readFileSync(new URL('../packs/BODY-RIG.json', import.meta.url), 'utf8')).rig;
  const has = (id, segs) => segs.every(s => rig.meshSegment[id].candidates.includes(s));
  assert.ok(has('FJ1493', ['r_index_pp', 'r_index_mp', 'r_index_dp']), 'right extensor indicis: the index finger to its tip');
  assert.ok(has('FJ1491', ['r_little_pp', 'r_little_mp', 'r_little_dp']), 'right extensor digiti minimi: the little finger to its tip');
  assert.ok(!rig.meshSegment.FJ1483.candidates.includes('r_thumb_dp'), 'a muscle that ends on a phalanx\'s base keeps its own end (abductor pollicis brevis)');
});

test('H26: in a fist the extensor indicis lies on the finger like the extensor digitorum beside it (it stood up to 54 mm off)', async () => {
  const S = await loadPageBody(), B = S.body, rig = S.rig, get = id => (S.meshesById.get ? S.meshesById.get(id) : S.meshesById[id]);
  const pose = B.poseBodyDetailed(rig, { r_grasp: 100 });
  const handSegs = Object.keys(rig.segments).filter(s => /^r_(hand|thumb_|index_|middle_|ring_|little_)/.test(s)), pts = [];
  for (const s of handSegs) { const m = pose.segments.get(s); for (const b of rig.segments[s].boneIds || []) { const p = get(b), P = p && (p.positions || p); if (!P) continue; for (let i = 0; i < P.length; i += 9) pts.push(m[0] * P[i] + m[4] * P[i + 1] + m[8] * P[i + 2] + m[12], m[1] * P[i] + m[5] * P[i + 1] + m[9] * P[i + 2] + m[13], m[2] * P[i] + m[6] * P[i + 1] + m[10] * P[i + 2] + m[14]); } }
  const hand = new Set(handSegs.map(s => B.BODY_SEGMENTS.indexOf(s))), recs = B.handSkinRecords(rig, S.meshesById);
  const offBone = id => { // the hand's own part of the muscle: its farthest vertex from a bone of the hand and digits (mm)
    const r = recs.get(id), pos = B.skinBodyPositions(pose.segments, r, r.src);
    let worst = 0;
    for (let v = 0; v < pos.length; v += 3) {
      if (!hand.has(r.i0[v / 3]) || !hand.has(r.i1[v / 3])) continue;
      let best = Infinity; for (let j = 0; j < pts.length; j += 3) best = Math.min(best, (pos[v] - pts[j]) ** 2 + (pos[v + 1] - pts[j + 1]) ** 2 + (pos[v + 2] - pts[j + 2]) ** 2);
      worst = Math.max(worst, Math.sqrt(best));
    }
    return worst;
  };
  const ei = offBone('FJ1493'), ed = offBone('FJ1492');
  assert.ok(ei <= ed + 2, `extensor indicis ${ei.toFixed(1)} mm from the bones at most, extensor digitorum ${ed.toFixed(1)} (with the old skin 17.7)`);
});
