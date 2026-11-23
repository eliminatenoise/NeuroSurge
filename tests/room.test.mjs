/** The room behind everything (ns-room): a dark place, not a void. The light along a line of sight (roomLight, the
 * shader's arithmetic in JavaScript), the view matrix of the loading picture, the dust, the light's small reactions.
 * 21 November 2026 (the owner, Message 208): the game now draws the abyss (ROOM.abyss.on; tests/abyss.test.mjs), and the
 * room is what ROOM.abyss.on false brings back. These tests keep the room as it was: they read the room's rule, ROOM
 * with the abyss switched off (THEATRE). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOM, roomLight as roomLightOf, srgbOf, roomGlsl, roomRayMatrix, roomGain, roomBeatStep, roomActiveStep, ROOM_ORDER, isAbyss } from '../scene/src/ns-room.mjs';
import { ASSEMBLY } from '../scene/src/ns-assembly-core.mjs';
import { RAW_LOOK } from '../scene/src/ns-raw-look.mjs'; // 20 November 2026: the raw look's room

const THEATRE = Object.freeze({ ...ROOM, abyss: Object.freeze({ ...ROOM.abyss, on: false }) });
const roomLight = (eye, dir, st = {}, o = THEATRE, footM = 0) => roomLightOf(eye, dir, st, o, footM);
const DEG = Math.PI / 180;
const dirOf = (yawDeg, pitchDeg) => [-Math.sin(yawDeg * DEG) * Math.cos(pitchDeg * DEG), Math.sin(pitchDeg * DEG), -Math.cos(yawDeg * DEG) * Math.cos(pitchDeg * DEG)];
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const shown = c => lum(c.map(srgbOf));
const EYE = [0, 0.11, -0.04];
const shade = [[0, -7.5, ...ROOM.shade.brain], [0, -2.06, ...ROOM.shade.mirror], [ROOM.bodyAt[0], ROOM.bodyAt[2], ...ROOM.shade.body]];
const aura = [[0, -6.5, -7.5, 7], [-0.04, -0.23, -2.06, 0.85], [...ROOM.bodyAt, 0.85]];

test('the room has a floor below, a far wall for a horizon and lamps overhead, whichever way you look', () => {
  for (let yaw = -180; yaw < 180; yaw += 30) {
    assert.equal(roomLight(EYE, dirOf(yaw, -60)).meets, 'floor', `down, yaw ${yaw}`);
    assert.equal(roomLight(EYE, dirOf(yaw, -1)).meets, 'wall', `just under level, yaw ${yaw}`);
    assert.equal(roomLight(EYE, dirOf(yaw, 80)).meets, 'ceiling', `up, yaw ${yaw}`);
    // the foot of the wall is a far horizon: within 4 degrees of eye level all the way round (it does not bulge)
    assert.equal(roomLight(EYE, dirOf(yaw, -4)).meets, 'floor', `the floor reaches to 4 degrees under level, yaw ${yaw}`);
  }
  // straight up and straight down are finite
  for (const d of [[0, 1, 0], [0, -1, 0]]) for (const v of roomLight(EYE, d).colour) assert.ok(Number.isFinite(v));
});

test('the lamp heads are soft lights with no dark middle, and never in a level look', () => {
  // a level look shows at most 58 degrees up (the top middle of a 116 degree picture): nothing there is brighter than a faint glow
  let top = 0;
  for (let yaw = -180; yaw < 180; yaw += 5) for (let pitch = 0; pitch <= 58; pitch += 2) top = Math.max(top, shown(roomLight(EYE, dirOf(yaw, pitch)).colour));
  assert.ok(top < 0.12, `nothing bright up to 58 degrees up (${top.toFixed(3)})`);
  // each lamp: brightest in its middle, falling off outward the whole way (no ring, no hole)
  const C = ROOM.centre;
  for (const L of ROOM.lamps) {
    let last = Infinity;
    for (let k = 0; k <= 12; k++) {
      const x = C[0] + L[0] + (k / 12) * 1.3 * L[2], z = C[1] + L[1], d = [x - EYE[0], ROOM.ceilY - EYE[1], z - EYE[2]], n = Math.hypot(...d);
      const v = lum(roomLight(EYE, d.map(q => q / n)).colour);
      assert.ok(v <= last + 1e-9, `lamp at ${L[0]},${L[1]}: light falls outward (step ${k})`);
      last = v;
    }
    const d = [C[0] + L[0] - EYE[0], ROOM.ceilY - EYE[1], C[1] + L[1] - EYE[2]], elev = Math.atan2(d[1], Math.hypot(d[0], d[2])) / DEG;
    assert.ok(elev > 66, `lamp middle ${elev.toFixed(1)} degrees up`);
  }
});

test('it stays a dark picture: nothing but the lamp heads is brighter than a dark grey, and the far edges are the old space black', () => {
  let maxLow = 0, maxAll = 0;
  for (let yaw = -180; yaw < 180; yaw += 6) for (let pitch = -89; pitch <= 89; pitch += 2) {
    const r = roomLight(EYE, dirOf(yaw, pitch), { shade, aura }, THEATRE, 0.5), s = shown(r.colour);
    for (const v of r.colour) assert.ok(Number.isFinite(v) && v >= 0);
    maxAll = Math.max(maxAll, s);
    if (pitch <= 30) maxLow = Math.max(maxLow, s);
  }
  assert.ok(maxLow < 0.28, `the floor and the wall stay under about a quarter of white (${maxLow.toFixed(3)})`);
  assert.ok(maxAll < 0.6, `even the lamp heads stay well under white (${maxAll.toFixed(3)})`);
  // behind you, level: the curtain's upper part is within a few steps of the room's darkest colour
  const far = roomLight(EYE, dirOf(180, 25)).colour.map(srgbOf).map(v => Math.round(v * 255));
  const black = ROOM.black.map(srgbOf).map(v => Math.round(v * 255));
  assert.ok(far.every((v, i) => v >= black[i] && v <= black[i] + 4), `dark above the horizon behind you: ${far} (darkest ${black})`);
  if (RAW_LOOK.on) {
    // 20 November 2026 (the owner, Messages 195 / 196: the reference pictures' look for everything): the room was their
    // near-black RGB 18, 18, 22, its darkest a little under it so the faint pool of light landed there (ns-raw-look).
    // Later (Message 206: "let's make the background more of a black abyss, but still with a gradient"): its darkest is
    // a black abyss, RGB 4, 4, 5, and the pool of light (RAW_LOOK.roomPool) is the gradient left over it
    assert.deepEqual(black, [4, 4, 5]);
  } else {
    // 19 November 2026 (the owner: "much darker blacks instead of ugly grays"): darker than the old 0x05070b, and neutral
    assert.deepEqual(black, [3, 3, 4]);
  }
});

test('the pool of light is under the brain and falls away; the grout is darker than the tile; shadows darken the floor', () => {
  const at = (x, z, st) => { const d = [x - EYE[0], ROOM.floorY - EYE[1], z - EYE[2]], n = Math.hypot(...d); return roomLight(EYE, d.map(v => v / n), st); };
  const mid = lum(at(1.5, -7.5 + 1.5).colour), out = lum(at(31.5, -7.5 + 1.5).colour), edge = lum(at(1.5, 40.5).colour);
  assert.ok(mid > 1.5 * out && out > edge, `pool ${mid} > ${out} > ${edge}`);
  const tile = lum(at(4.5, -3).colour), grout = lum(at(6, -3).colour);
  assert.ok(grout < tile, 'a grout line is darker than the middle of a tile');
  const lit = lum(at(1.5, -6).colour), shaded = lum(at(1.5, -6, { shade }).colour);
  assert.ok(shaded < 0.8 * lit, 'the brain shades the floor under it');
});

test('the backdrop\'s light is steady: no swell with the beat or with a movement', () => {
  assert.equal(roomGain(0, 0), 1);
  // 19 November 2026 (the owner: "far more black of a background", "simplicity"): the backdrop's light is steady
  assert.equal(roomGain(1, 0), 1); assert.equal(roomGain(0, 1), 1); assert.equal(roomGain(1, 1), 1);
  let l = 0;
  for (let i = 0; i < 120; i++) l = roomActiveStep(l, true, 1 / 60);
  assert.equal(l, 1, 'on within two seconds');
  for (let i = 0; i < 600; i++) l = roomActiveStep(l, false, 1 / 60);
  assert.equal(l, 0, 'off again');
  // the beat is softened: one frame of a full beat moves the light by a small share only
  assert.ok(roomBeatStep(0, 1, 1 / 60) < 0.2);
  let b = 0; for (let i = 0; i < 60; i++) b = roomBeatStep(b, 1, 1 / 60);
  assert.ok(b > 0.99);
});

test('under reduced motion the light does not change at all', () => {
  assert.equal(roomActiveStep(0, true, 0.016, true), 0);
  assert.equal(roomActiveStep(0.6, true, 0.016, true), 0);
  assert.equal(roomBeatStep(0.5, 1, 0.016, true), 0);
  assert.equal(roomGain(1, 1, ROOM, true), 1);
  let l = 0, b = 0;
  for (let i = 0; i < 200; i++) { l = roomActiveStep(l, i < 100, 1 / 60, true); b = roomBeatStep(b, (i % 55) / 55, 1 / 60, true); assert.equal(roomGain(b, l, ROOM, true), 1); }
});

test('the lit air round the brain and round a body seen from outside: a halo that follows the thing, none from inside it', () => {
  const look = (eye, to, st) => { const d = [to[0] - eye[0], to[1] - eye[1], to[2] - eye[2]], n = Math.hypot(...d); return lum(roomLight(eye, d.map(v => v / n), st).colour); };
  // a line just outside the brain's outline (1.1 radii from its middle, to the side) is lighter with the halo than without
  const beside = [aura[0][0] + 1.1 * aura[0][3], aura[0][1], aura[0][2]], far = [EYE[0], EYE[1] + 1, EYE[2] + 10];
  assert.ok(look(EYE, beside, { aura }) > look(EYE, beside, {}) + 0.003, 'beside the brain the air is lit');
  assert.equal(look(EYE, far, { aura }), look(EYE, far, {}), 'on a look away from the things the room is as black as without them');
  // the halo goes with the brain when it is carried
  const moved = aura.map(a => a.slice()); moved[0][0] -= 12;
  assert.ok(look(EYE, beside, { aura: moved }) < look(EYE, beside, { aura }));
  // your own body: nothing from the eyes (the view point is inside it), a halo from the view from outside
  const only = [null, null, aura[2]], behind = [0, 1.3, 2.2];
  for (let yaw = -180; yaw < 180; yaw += 45) for (const pitch of [-70, -30, 0, 40]) assert.ok(Math.abs(lum(roomLight(EYE, dirOf(yaw, pitch), { aura: only }).colour) - lum(roomLight(EYE, dirOf(yaw, pitch), {}).colour)) < 1e-6);
  assert.ok(look(behind, ROOM.bodyAt, { aura: only }) > look(behind, ROOM.bodyAt, {}) + 0.002);
  // a missing radius switches a halo off
  assert.equal(look(EYE, beside, { aura: [[0, -6.5, -7.5, 0], null, null] }), look(EYE, beside, {}));
});

test('the shader carries the same numbers and the draw order puts the room behind everything', () => {
  assert.equal(isAbyss(THEATRE), false);
  const g = roomGlsl(THEATRE);
  assert.ok(g.includes('vec3 nsRoom( vec3 eye, vec3 dir )'));
  assert.ok(g.includes(String(ROOM.wallR * ROOM.wallR)) && g.includes(ROOM.floorY.toFixed(1)));
  assert.ok(!/NaN|undefined|Infinity/.test(g));
  assert.ok(ROOM_ORDER.backdrop > 1000);
  assert.ok(!/gl_PointSize/.test(g) && ROOM.dust === undefined, 'no dust');
});

test('the loading picture sees the room as the game first sees it', () => {
  const m = roomRayMatrix(new Float32Array(9), { fovYDeg: 116, aspect: 16 / 9, pitchDeg: -41 });
  const mid = [-m[6], -m[7], -m[8]], want = dirOf(0, -41);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(mid[i] - want[i]) < 1e-6, 'the middle of the picture looks 41 degrees down');
  // the top edge: 58 degrees above the middle
  const top = [m[3] - m[6], m[4] - m[7], m[5] - m[8]], n = Math.hypot(...top);
  assert.ok(Math.abs(Math.asin(top[1] / n) / DEG - 17) < 1e-4);
  // the launcher's own first view is what ASSEMBLY.room repeats for a caller that passes none
  const src = readFileSync(new URL('../scene/example/eye-view-r558.mjs', import.meta.url), 'utf8');
  const fov = Number(/const EYE_FOV_Y_DEG = (-?[\d.]+)/.exec(src)[1]), pitch = Number(/const START_LOOK_PITCH_DEG = (-?[\d.]+)/.exec(src)[1]);
  assert.equal(ASSEMBLY.room.fovYDeg, fov);
  assert.equal(ASSEMBLY.room.pitchDeg, pitch);
  // (20 November 2026: the page's first script starts the picture with ASSEMBLY.room, before the launcher is in; the
  // launcher then takes the same picture over with its own numbers, shared: true, which these lines keep equal)
  assert.ok(/startAssembly\(\{ host: app, room: \{ fovYDeg: EYE_FOV_Y_DEG, pitchDeg: START_LOOK_PITCH_DEG \}, shared: true \}\)/.test(src));
});
