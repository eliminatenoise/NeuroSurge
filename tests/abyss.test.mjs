/** The abyss behind everything (ns-room ROOM.abyss; 21 November 2026). The owner, Message 208: "Background should still be
 * more of an abyss."; Message 206: "more of a black abyss, but still with a gradient"; Message 135: "not exactly pitch
 * black, with the gradient changing as you go further or closer away"; Message 89: "something should be done about the
 * endless black space". The light along a line of sight (roomLight: the shader's arithmetic in JavaScript) with the three
 * things where the game's start view has them (read from the running game: inspect().scene.room.things). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOM, roomLight, srgbOf, roomGlsl, isAbyss, roomClearHex, roomThingSize } from '../scene/src/ns-room.mjs';
import { ASSEMBLY } from '../scene/src/ns-assembly-core.mjs';
import { RAW_LOOK } from '../scene/src/ns-raw-look.mjs';

const DEG = Math.PI / 180;
const dirOf = (yawDeg, pitchDeg) => [-Math.sin(yawDeg * DEG) * Math.cos(pitchDeg * DEG), Math.sin(pitchDeg * DEG), -Math.cos(yawDeg * DEG) * Math.cos(pitchDeg * DEG)];
/** What the screen shows (0..255), the mean of red, green and blue, not rounded. */
const shown = c => (srgbOf(c[0]) + srgbOf(c[1]) + srgbOf(c[2])) / 3 * 255;
const THEATRE = Object.freeze({ ...ROOM, abyss: Object.freeze({ ...ROOM.abyss, on: false }) });
// the game's start view: the brain (a flat disc tipped toward you: its own measure as a 3x3 matrix), the mirror body, your body
const BRAIN = [0.037, -1.612, -5.921, 1, 0.33, 0, 0, 0, 0.282, 1.386, 0, -0.065, 6.005], MIRROR = [0.005, -0.239, -2.198, 0.873], BODY = [-0.04, -0.23, -0.53, 0.85];
const ST = { aura: [BRAIN, MIRROR, BODY], size: [3.028, 0.873, 0.85] };
// the camera of the eye view at the start (it stands a little behind the eyes), looking up, and from outside (E)
const EYE = [0, 0.358, 0.462], EYE_UP = [0, 0.349, 0.658], EYE_DOWN = [0, 0.559, -0.117], EYE_OUT = [0, 1.353, 0.427];
const START_PITCH = -25.5, FOV_Y = 54, ASPECT = 16 / 9;
/** The line of sight through a point of the picture (u, v in -1..1) for a look yaw / pitch degrees. */
function through(u, v, yawDeg, pitchDeg) {
  const ty = Math.tan(FOV_Y * DEG / 2), tx = ty * ASPECT, y = yawDeg * DEG, p = pitchDeg * DEG, cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
  const right = [cy, 0, -sy], up = [sy * sp, cp, cy * sp], back = [sy * cp, -sp, cy * cp];
  const d = [0, 1, 2].map(k => right[k] * u * tx + up[k] * v * ty - back[k]), n = Math.hypot(...d);
  return d.map(q => q / n);
}
const at = (eye, u, v, yaw, pitch, st = ST, o = ROOM) => shown(roomLight(eye, through(u, v, yaw, pitch), st, o).colour);

test('the abyss is what the game draws; the room is behind one switch and is not changed', () => {
  assert.equal(ROOM.abyss.on, true);
  assert.equal(isAbyss(), true);
  assert.equal(isAbyss(THEATRE), false);
  // its black: RGB 2, 2, 2 on the screen, and the scene's clear colour under the backdrop is the same
  assert.deepEqual(ROOM.abyss.black.map(v => Math.round(srgbOf(v) * 255)), [2, 2, 2]);
  assert.equal(roomClearHex(), 0x020202);
  assert.equal(roomClearHex(THEATRE), null, 'the room keeps the caller\'s own clear colour');
  // the room's own black and pool are as they were (RGB 4, 4, 5: section 176), not the abyss's
  assert.deepEqual(ROOM.black, RAW_LOOK.room);
  assert.deepEqual(ROOM.black.map(v => Math.round(srgbOf(v) * 255)), [4, 4, 5]);
  assert.deepEqual(ROOM.pool.colour, RAW_LOOK.roomPool);
  // the dither cannot clip at zero (a clipped dither would lift the black): the black stands above its amplitude
  assert.ok(srgbOf(Math.min(...ROOM.abyss.black)) * 255 > ROOM.ditherLsb, 'the black is more than the dither above zero');
  const src = readFileSync(new URL('../scene/src/ns-scene-three.mjs', import.meta.url), 'utf8');
  assert.ok(/const abyssHex = roomClearHex\(\);/.test(src) && /abyssHex === null \? 0x040405 : abyssHex/.test(src), 'the scene takes its clear colour from the abyss');
});

test('nothing in it is a place: no floor, wall, horizon or lamp in any direction, and without the things only the black', () => {
  for (let yaw = -180; yaw < 180; yaw += 15) for (let pitch = -90; pitch <= 90; pitch += 15) {
    const r = roomLight(EYE, dirOf(yaw, pitch), {});
    assert.equal(r.meets, 'abyss');
    assert.deepEqual(r.colour, [...ROOM.abyss.black], `no thing, no light (yaw ${yaw}, pitch ${pitch})`);
  }
  // with the things: every value is a finite number, and the same from any height (no floor to come nearer to)
  for (let yaw = -180; yaw < 180; yaw += 30) for (let pitch = -90; pitch <= 90; pitch += 10) for (const v of roomLight(EYE, dirOf(yaw, pitch), ST).colour) assert.ok(Number.isFinite(v) && v >= 0);
  const shift = (st, dy) => ({ ...st, aura: st.aura.map(a => { const b = a.slice(); b[1] += dy; return b; }) });
  for (const pitch of [-80, -40, 0, 40]) {
    const a = shown(roomLight(EYE, dirOf(20, pitch), ST).colour), b = shown(roomLight([EYE[0], EYE[1] + 9, EYE[2]], dirOf(20, pitch), shift(ST, 9)).colour);
    assert.ok(Math.abs(a - b) < 1e-9, 'the picture depends on where the things are, not on a height above anything');
  }
});

test('a deep abyss with a gradient: the start view is near black at its corners and lit by the brain\'s outline', () => {
  const corners = [at(EYE, -0.98, 0.74, 0, START_PITCH), at(EYE, 0.98, 0.97, 0, START_PITCH), at(EYE, -0.98, -0.91, 0, START_PITCH), at(EYE, 0.98, -0.96, 0, START_PITCH)];
  // (the room of Body update 63 measured 12 to 18 there; the owner: "should still be more of an abyss")
  for (const c of corners) assert.ok(c > 3.5 && c < 8, `a corner of the start view is ${c.toFixed(1)}: near black, not black`);
  // beside the brain (the left of the picture, half way up): from the edge in toward the outline the light only rises
  let last = 0;
  for (let i = 0; i <= 11; i++) { const u = -0.98 + 0.04 * i, v = at(EYE, u, 0, 0, START_PITCH); assert.ok(v > last, `rising toward the brain at u ${u.toFixed(2)} (${v.toFixed(2)})`); last = v; }
  assert.ok(last > 10 && last < 18, `by the brain's outline ${last.toFixed(1)}`);
  assert.ok(last > 1.8 * Math.max(...corners), 'the gradient is plain: by the brain about twice the corners or more');
  // nothing anywhere is brighter than a very dark grey (the brightest is behind the brain's middle, where the brain covers it)
  let top = 0, low = Infinity;
  for (const eye of [EYE, EYE_OUT]) for (let yaw = -180; yaw < 180; yaw += 3) for (let pitch = -89; pitch <= 89; pitch += 3) { const v = shown(roomLight(eye, dirOf(yaw, pitch), ST).colour); top = Math.max(top, v); low = Math.min(low, v); }
  assert.ok(top < 32, `the brightest of the abyss is ${top.toFixed(1)} of 255`);
  assert.ok(low >= shown(ROOM.abyss.black) - 1e-9 && low < 2.2, `the darkest is the black itself (${low.toFixed(2)})`);
});

test('never one flat black: a look straight up, straight down, to the side and from outside is lighter toward the brain', () => {
  // straight up from the eyes: the brain is below the picture; the lower edge is lighter than the upper, evenly
  const up = [0.95, 0.5, 0, -0.5, -0.95].map(v => at(EYE_UP, 0, v, 0, 88));
  for (let i = 1; i < up.length; i++) assert.ok(up[i] > up[i - 1] + 0.2, `looking up: lighter toward the lower edge (${up.map(v => v.toFixed(2))})`);
  assert.ok(up[up.length - 1] - up[0] > 1.4, 'more than a step and a half over the picture');
  // (the glow close round the things alone leaves that look one flat black: the wide light is what makes the gradient)
  const noFar = { ...ROOM, abyss: { ...ROOM.abyss, far: { light: 0, cap: 1 } } };
  assert.ok(Math.abs(at(EYE_UP, 0, -0.95, 0, 88, ST, noFar) - at(EYE_UP, 0, 0.95, 0, 88, ST, noFar)) < 0.05);
  // straight down: the upper edge (toward the brain) is lighter than the lower
  assert.ok(at(EYE_DOWN, 0.9, 0.95, 0, -88) > at(EYE_DOWN, 0.9, -0.95, 0, -88) + 1.2);
  // 62 degrees to the left: the brain stands at the right edge; the light falls all the way to the left edge
  const side = [-0.95, -0.5, 0, 0.4].map(u => at(EYE, u, 0.3, 62, START_PITCH));
  for (let i = 1; i < side.length; i++) assert.ok(side[i] > side[i - 1], `looking left: lighter toward the brain (${side.map(v => v.toFixed(2))})`);
  // from outside (E): the picture's edges are above the black
  for (const [u, v] of [[-0.98, 0.9], [0.98, 0.9], [-0.98, 0], [0.98, -0.9]]) assert.ok(at(EYE_OUT, u, v, 0, -39.5) > 3.5, 'from outside the edges are not the bare black');
});

test('the wide light round the brain has no edge: full toward it, half at right angles, none straight away', () => {
  const only = { ...ROOM, abyss: { ...ROOM.abyss, glow: { ...ROOM.abyss.glow, brain: [0, 1, 0], mirror: [0, 1, 0], body: [0, 1, 0] } } };
  const ball = [[0, 0, -10, 4]], lum = d => roomLight([0, 0, 0], d, { aura: ball }, only).colour[0] - ROOM.abyss.black[0];
  const F = ROOM.abyss.far, k = ROOM.abyss.glow.colour[0], full = F.light * (4 / 10) * k;
  assert.ok(Math.abs(lum([0, 0, -1]) - full) < 1e-12, 'toward the brain: light x its size in the view');
  assert.ok(Math.abs(lum([1, 0, 0]) - full / 2) < 1e-12 && Math.abs(lum([0, 1, 0]) - full / 2) < 1e-12, 'at right angles: half');
  assert.ok(Math.abs(lum([0, 0, 1])) < 1e-12, 'straight away: none');
  // it is one even slope over the whole sphere: linear in the cosine of the angle to the brain
  for (let a = 0; a <= 180; a += 15) assert.ok(Math.abs(lum([Math.sin(a * DEG), 0, -Math.cos(a * DEG)]) - full * (0.5 + 0.5 * Math.cos(a * DEG))) < 1e-12);
  // the whole abyss, things and all, changes by less than a fifth of one screen step over a quarter of a degree, anywhere
  let step = 0;
  for (let yaw = -180; yaw < 180; yaw += 6) { let last = null; for (let pitch = -89; pitch <= 89; pitch += 0.25) { const v = shown(roomLight(EYE, dirOf(yaw, pitch), ST).colour); if (last !== null) step = Math.max(step, Math.abs(v - last)); last = v; } }
  for (let pitch = -88; pitch <= 88; pitch += 8) { let last = null; for (let yaw = -180; yaw <= 180; yaw += 0.25) { const v = shown(roomLight(EYE, dirOf(yaw, pitch), ST).colour); if (last !== null) step = Math.max(step, Math.abs(v - last)); last = v; } }
  assert.ok(step < 0.25, `no edge anywhere (the steepest change is ${step.toFixed(3)} of a screen step per quarter degree)`);
});

test('the gradient changes as things come nearer or go away', () => {
  // the brain nearer: more of the dark is lit (the same line of sight, well to the side of it); further: less
  const moved = dz => ({ ...ST, aura: [BRAIN.map((v, i) => (i === 2 ? v + dz : v)), MIRROR, BODY] });
  const side = dirOf(70, START_PITCH);
  const near = shown(roomLight(EYE, side, moved(3)).colour), start = shown(roomLight(EYE, side, ST).colour), far = shown(roomLight(EYE, side, moved(-8)).colour);
  assert.ok(near > start + 0.3 && start > far + 0.3, `nearer ${near.toFixed(2)} > ${start.toFixed(2)} > further ${far.toFixed(2)}`);
  // ... but never more than the cap: a brain right at the view point lights the dark no more than `light`
  const F = ROOM.abyss.far;
  assert.ok(F.cap <= 1 && F.light <= 0.004, 'the wide light stays faint');
  const atEye = roomLight(EYE, dirOf(0, 60), { aura: [[EYE[0], EYE[1], EYE[2] - 0.01, 3]], size: [3] }).colour[0];
  assert.ok(atEye <= ROOM.abyss.black[0] + F.light * F.cap * ROOM.abyss.glow.colour[0] + 1e-12 && Number.isFinite(atEye));
  // the glow close round the mirror body goes with it, and grows in the picture as the body comes nearer
  const mirrorAt = z => ({ aura: [null, [0.005, -0.239, z, 0.873], null] });
  const beside = (z, off) => { const d = [0.005 + off - EYE[0], -0.239 - EYE[1], z - EYE[2]], n = Math.hypot(...d); return shown(roomLight(EYE, d.map(q => q / n), mirrorAt(z)).colour); };
  assert.ok(beside(-2.198, 0.4) > shown(ROOM.abyss.black) + 4, 'beside the mirror body the dark is lit');
  const d = through(-0.6, 0, 0, -12.7); // a fixed line of sight, to the left of the mirror body
  assert.ok(shown(roomLight(EYE, d, mirrorAt(-0.885)).colour) > shown(roomLight(EYE, d, mirrorAt(-2.198)).colour) + 1, 'held near, its glow reaches further across the picture');
  assert.ok(shown(roomLight(EYE, d, mirrorAt(-3.971)).colour) < shown(roomLight(EYE, d, mirrorAt(-2.198)).colour), 'pushed away, less');
});

test('your own body lights the dark only when it is seen from outside', () => {
  const only = { aura: [null, null, BODY] };
  // from the eyes the camera stands 1.05 to 1.56 of the body's radius from its middle: nothing, whichever way you look
  // (at most one screen step, and that only from where the camera stands for a look straight up, toward the body it then does not show)
  for (const eye of [EYE, EYE_UP, EYE_DOWN, [0.295, 0.325, 0.262]]) {
    const r = Math.hypot(BODY[0] - eye[0], BODY[1] - eye[1], BODY[2] - eye[2]) / BODY[3];
    assert.ok(r > 1 && r < 1.6, `the eye view's camera is ${r.toFixed(2)} radii from the body's middle`);
    for (let yaw = -180; yaw < 180; yaw += 30) for (let pitch = -80; pitch <= 80; pitch += 20) assert.ok(shown(roomLight(eye, dirOf(yaw, pitch), only).colour) < shown(ROOM.abyss.black) + 1, 'no broad lift from the body you are in');
  }
  for (let v = -0.95; v <= 0.95; v += 0.19) assert.ok(Math.abs(at(EYE_UP, 0, v, 0, 88, only) - shown(ROOM.abyss.black)) < 0.1, 'none in the look straight up');
  // from outside (2.2 radii): the dark behind the figure is lit
  const d = [BODY[0] + 0.35 - EYE_OUT[0], BODY[1] - EYE_OUT[1], BODY[2] - EYE_OUT[2]], n = Math.hypot(...d);
  assert.ok(shown(roomLight(EYE_OUT, d.map(q => q / n), only).colour) > shown(ROOM.abyss.black) + 5);
  // the rule's row says so: [light, spread, core, from, full]
  const b = ROOM.abyss.glow.body;
  assert.ok(b.length === 5 && b[3] >= 1.4 && b[4] > b[3] && b[4] <= 2.2);
});

test('a thing\'s size for the wide light: its radius, or the largest half size of its own measure', () => {
  assert.equal(roomThingSize([0, 0, 0, 2.5]), 2.5);
  assert.equal(roomThingSize([0, 0, 0, 2.5], 4), 4);
  assert.equal(roomThingSize(null), 0);
  assert.equal(roomThingSize([0, 0, 0, 0]), 0);
  // a brain that is switched off (its row's 4th number 0) lights nothing, whatever size is given beside it
  assert.deepEqual(roomLight([0, 0, 0], [0, 0, -1], { aura: [[0, 0, -10, 0]], size: [4] }).colour, [...ROOM.abyss.black]);
  // the brain's matrix: half sizes 3.03, 3.46 and 0.16 m; the largest
  assert.ok(Math.abs(roomThingSize(BRAIN) - 3.455) < 0.01);
});

test('the shader is the abyss: the same numbers, none of the room\'s arithmetic, and much shorter', () => {
  const g = roomGlsl(), room = roomGlsl(THEATRE);
  assert.ok(g.includes('vec3 nsRoom( vec3 eye, vec3 dir )'));
  assert.ok(!/NaN|undefined|Infinity/.test(g));
  for (const word of ['nsRoomWall', 'nsRoomLamps', 'nsRoomGrout', 'fwidth', 'uRoomShade', 'atan(', 'pow(']) assert.ok(!g.includes(word), `the abyss has no ${word}`);
  for (const word of ['nsRoomWall', 'nsRoomLamps', 'nsRoomGrout', 'uRoomShade']) assert.ok(room.includes(word), `the room keeps its ${word}`);
  assert.ok(g.includes('uniform vec3 uRoomSize;') && g.includes('uRoomAuraN[ 2 ]'));
  const A = ROOM.abyss, f = x => (Number.isInteger(x) ? x.toFixed(1) : String(x));
  assert.ok(g.includes(`vec3( ${A.black.map(f).join(', ')} )`), 'its black');
  assert.ok(g.includes(`vec3( ${A.glow.colour.map(f).join(', ')} )`), 'its tint');
  for (const key of ['brain', 'mirror', 'body']) assert.ok(g.includes(`au += ${f(A.glow[key][0])} * step`), `the ${key}'s glow`);
  assert.ok(g.includes(`smoothstep( ${f(A.glow.body[3])}, ${f(A.glow.body[4])}, sqrt( ee ) )`) && g.includes('smoothstep( 0.7, 1.6, sqrt( ee ) )'), 'how near the view point may come');
  assert.ok(g.includes(`au += ${f(A.far.light)} * step( 0.5, uRoomAura[ 0 ].w ) * min( uRoomSize.x / D, ${f(A.far.cap)} )`), 'the wide light');
  assert.ok(g.length < 0.5 * room.length, `shorter than the room's (${g.length} against ${room.length} characters)`);
  // without the wide light the text has no row for it (ROOM.abyss.far.light 0)
  assert.ok(!roomGlsl({ ...ROOM, abyss: { ...ROOM.abyss, far: { light: 0, cap: 1 } } }).includes('uRoomSize.x'));
});

test('the loading picture and the page behind it are the same abyss', () => {
  // the loading picture: the abyss seen by its own camera, lit round its own brain and bodies
  const core = readFileSync(new URL('../scene/src/ns-assembly-core.mjs', import.meta.url), 'utf8');
  assert.ok(core.includes('const abyss = isAbyss(ROOM);') && core.includes('createRoomBackdrop({ THREE, fixed: !abyss })'));
  assert.ok(ASSEMBLY.abyss.brainMm > 300 && ASSEMBLY.abyss.brainMm < 800 && ASSEMBLY.abyss.bodyMm > 700 && ASSEMBLY.abyss.bodyMm < 1000);
  // seen from the loading picture's viewer its brain is small, so little of the dark is lit: the far corners stay near the black
  const cam = ASSEMBLY.camera.at, b = ASSEMBLY.bodyCentre;
  const st = { aura: [[...ASSEMBLY.brainAt, ASSEMBLY.abyss.brainMm], [...b, ASSEMBLY.abyss.bodyMm], [-b[0], b[1] - ASSEMBLY.selfAheadMm, b[2], ASSEMBLY.abyss.bodyMm]] };
  const look = to => { const d = [to[0] - cam[0], to[1] - cam[1], to[2] - cam[2]], n = Math.hypot(...d); return shown(roomLight(cam, d.map(q => q / n), st).colour); };
  assert.ok(look([ASSEMBLY.brainAt[0] + 1.15 * ASSEMBLY.abyss.brainMm, ASSEMBLY.brainAt[1], ASSEMBLY.brainAt[2]]) > 8, 'by its brain the dark is lit');
  assert.ok(look([b[0] + 420, b[1], b[2]]) > 6, 'and by its mirror body');
  assert.ok(look([-4000, b[1], b[2]]) < 3.2, 'far to the side it is the black');
  // the page: the loading canvas before its first frame, and the page's very first paint, end in the abyss's black
  const css = readFileSync(new URL('../scene/example/assembly.css', import.meta.url), 'utf8');
  const hex = '#' + roomClearHex().toString(16).padStart(6, '0');
  const app = /\.ns-app \{ background: radial-gradient\(([^;]*)\); \}/.exec(css);
  assert.ok(app && app[1].trim().endsWith(`${hex} 100%`), 'the first paint falls off to the abyss\'s black');
  // the loading canvas before its first frame: the same black with the same gradient over it
  const canvas = /\.ns-assembly \{[^}]*background: (#[0-9a-f]{6}) radial-gradient\(([^;]*)\);/.exec(css);
  assert.ok(canvas && canvas[1] === hex && canvas[2] === app[1], `the loading canvas starts as the page behind it (${hex})`);
  const stops = [...app[1].matchAll(/#([0-9a-f]{6})/g)].map(m => [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)));
  assert.ok(stops.length >= 2 && stops.every(c => Math.max(...c) <= 14), 'no grey in the first paint (it was RGB 27, 33, 36)');
});
