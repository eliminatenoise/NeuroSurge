/** NeuroSurge scene: THE ROOM (owner, 18 November 2026: "And perhaps something should be done about the endless black
 * space."; 11 November: "Everything should look clinical and surgical."; Message 24: "I liked the space black
 * background"; Message 25: "Contrast and high dynamic range are still visually key").
 *
 * The brain, your body and the mirror body used to hang in a flat black void. They now hang in a PLACE: a very large,
 * round, dark operating theatre seen out of focus. Far below there is a tiled floor with a soft pool of surgical light
 * on it; round the pool the floor falls away into the dark; very far off a faint band of light at the foot of the wall
 * gives a horizon; high overhead, a little ahead of straight up, hang the soft lights of the lamp heads (they show
 * which way is up and are in the picture only when you look up); the air round the brain and round a body seen from
 * outside is faintly lit (a soft halo), and each of the three casts a soft shadow on the floor. It is still a dark
 * picture: away from the pool, the lamps and the three things the room is the old
 * space black (ROOM.black is the old background colour), so the glows keep their contrast.
 *
 * One shader on one full-screen triangle, drawn at the far depth after the solid things (so it is shaded only where
 * nothing covers it). No texture, no shadow map, no extra pass. (There was dust, as a few hundred points: far motes
 * were too faint to see and near ones read as stars in a black sky, the very thing the room is there to end; it is
 * gone.) The room is
 * fixed in the world: it has a floor and a ceiling whichever way you look, and it shifts properly when the view
 * point moves (the view from outside).
 *
 * A PICTURE OF A PLACE and nothing more: it is not a model of a real theatre, its sizes are chosen for the eye (the
 * brain is drawn many metres across, so the room is a hall), and nothing here is measured.
 *
 * Under prefers-reduced-motion the light does not change at all (no beat, no answer to a movement).
 *
 * THE ABYSS (21 November 2026; the owner, Message 208, after Body update 63: "Background should still be more of an
 * abyss."; before it, Message 206: "let's make the background more of a black abyss, but still with a gradient",
 * Message 135: "not exactly pitch black, with the gradient changing as you go further or closer away", and Message 89:
 * "something should be done about the endless black space"). With ROOM.abyss.on (the default) there is no place any
 * more: no floor, no pool of light on it, no wall, no horizon, no lamps and no shadows. The things hang in a deep black
 * (ROOM.abyss.black), and the only light in it is the faintly lit dark round them:
 *  - a soft glow close round the brain, the mirror body and your own body seen from outside (ROOM.abyss.glow: the
 *    halo's own rule, wider and fainter, with no rim): brightest behind a thing, falling off through its outline into
 *    the black over about one of its sizes. It is measured in the thing's own size, so it grows in the picture as the
 *    thing comes nearer and shrinks as it goes away;
 *  - round the brain, the largest thing, a much wider and fainter light as well (ROOM.abyss.far): the whole side of
 *    the dark on which the brain stands is a few steps above the black, and it falls off evenly to the black itself on
 *    the side away from the brain. It is stronger the larger the brain stands in the view (nearer: more lit dark;
 *    further: less). So a look past the things, or straight up or down, is not one flat black either: it is lighter
 *    toward the brain.
 * Nothing in it has an edge, a shape or a place of its own, so nothing reads as a floor, a wall or an object. The
 * shader is shorter than the room's (no floor, wall, lamp or shadow arithmetic). abyss.on false brings the room back
 * exactly as it was.
 */
import { RAW_LOOK } from './ns-raw-look.mjs';

/** Display choices (metres in the game's world: +y up, the eye near the origin, the look starts along -z).
 *  floorY / ceilY: the floor's and the lamp plane's height; wallR: the wall's radius about the light's axis (far: its
 *    foot is a nearly straight horizon a few degrees under eye level).
 *  centre: where the light's axis stands (x, z) until the scene gives the brain's first place (setCentre); the
 *    brain's pivot starts 7.5 m ahead (ns-app), so this is also where the loading picture puts it.
 *  bodyAt: about where your own body's middle is (for its floor shadow and its halo).
 *  black: the darkest the room gets (linear light) = the old flat background 0x05070b.
 *  pool: the light on the floor: `colour` (linear light at the middle), `radiusM` (falls to 37 % there), `amb` (the
 *    share of it that reaches the whole floor).
 *  tile: square tiles `sizeM` across with grout `groutM` wide that is `dark` of the tile's light darker.
 *  wall: `colour` at the foot of the wall, fading with height (`heightM` to 37 %); a slow unevenness round the room
 *    (`lobes` broad soft patches, `uneven` of the light deep). No folds: fine upright lines fan out into rays in a
 *    wide picture that looks down.
 *  lamps: lamp heads on the ceiling plane, places relative to the centre: [x, z, radius, gain]. They hang round the
 *    point straight above the eye (the eye starts about 7.5 m behind the centre), so each is more than 60 degrees up:
 *    never in a level look, whichever way you turn. lamp: a light out of focus: a hot `core` (`coreR` radii wide), a
 *    soft `disc` round it (from `discIn` to `discOut` radii) and a wide faint `halo` (`haloR` radii); no dark middle.
 *  gloss: the floor mirrors the foot of the wall (`wall`): `f0` straight down, rising to 1 at a grazing look.
 *  aura: the lit air round a thing: [light (linear), spread (in the thing's radii), core (in radii: the light is
 *    full out to there and falls off beyond over `spread`)] for the brain, the mirror body and your own body. The
 *    brain's is a rim: full at its outline (core 1) and gone a third of its size farther out, so the room stays
 *    black beyond; a body's is a soft patch behind the figure (core 0); `colour` its tint; a thing's own radius when the scene gives none (`radii`). The
 *    halo follows the thing, and it is not drawn for a thing the view point is inside (your own body from the eyes).
 *  shade: soft shadows on the floor under the brain / the mirror body / your own body: [radius (m), depth (0..1)];
 *    the brain's is `brainK` times the brain's own widest level half-width when the scene gives that.
 *  live: the light is `beat` brighter at the top of a heartbeat (the beat is first softened over `beatS` seconds,
 *    so it swells and does not flick) and `active` brighter for a moment when a movement is switched on (it rises in
 *    `inS`, falls in `outS` seconds). Nothing of this under reduced motion.
 *  ditherLsb: +- noise in 1/255 steps so the slow ramps do not band. */
export const ROOM = Object.freeze({
  floorY: -13, ceilY: 16, wallR: 260,
  centre: Object.freeze([0, -7.5]), bodyAt: Object.freeze([-0.04, -0.23, -0.53]),
  // 19 November 2026 (the owner: "Let's have much darker blacks instead of ugly grays"): the darkest the room gets is
  // now nearly black and neutral (0.0015, 0.0021, 0.0033 before: the old blue-black 0x05070b), and the lit air round
  // the brain and the bodies is halved (0.012 and 0.02 before), so what is left of the gradient is the floor's pool.
  // 20 November 2026 (the owner, Messages 195 / 196: the look of the reference pictures "for everything"): in the raw
  // look (ns-raw-look RAW_LOOK.on) the darkest light is the pictures' near-black, RGB 18, 18, 22 (RAW_LOOK.room).
  black: RAW_LOOK.on ? RAW_LOOK.room : Object.freeze([0.0008, 0.0009, 0.0011]),
  // 19 November 2026 (the owner: "Let's go back to far more black of a background, but with a little bit of a gradient.
  // So not exactly pitch black, with the gradient changing as you go further or closer away"): the floor's pool of light
  // is the gradient (brightest under you, fading with distance) at about a third of its strength (0.020, 0.040, 0.042
  // before); no tile lines, no lamps, a wall that is nearly black.
  // (later, the owner: "Let's have much darker blacks instead of ugly grays": about a third again, and neutral instead
  // of blue-grey: 0.0065, 0.0105, 0.0125 before.)
  // (20 November 2026, Message 206: in the raw look the pool is RAW_LOOK.roomPool, the gradient left over a near-black room)
  pool: Object.freeze({ colour: RAW_LOOK.on && RAW_LOOK.roomPool ? RAW_LOOK.roomPool : Object.freeze([0.0028, 0.003, 0.0034]), radiusM: 19, amb: 0.05 }),
  // 19 November 2026 (eye comfort; the owner liked a plain dark background): the tile lines are barely there (dark 0.55 before).
  tile: Object.freeze({ sizeM: 3, groutM: 0.07, dark: 0 }),
  wall: Object.freeze({ colour: Object.freeze([0.0006, 0.0007, 0.0008]), heightM: 30, lobes: 7, uneven: 0.16 }),
  lamps: Object.freeze([Object.freeze([0.3, 4.9, 3.8, 1]), Object.freeze([-5, 9.3, 1.7, 0.75]), Object.freeze([-6.2, 5.1, 1.2, 0.6])]),
  lamp: Object.freeze({ colour: Object.freeze([0, 0, 0]), core: 0.7, coreR: 0.5, disc: 0.3, discIn: 0.45, discOut: 1.25, halo: 0.07, haloR: 2.2 }),
  gloss: Object.freeze({ f0: 0.05, wall: 0.7 }),
  aura: Object.freeze({ colour: Object.freeze([0.72, 0.96, 1]), brain: Object.freeze([0.006, 0.4, 1]), mirror: Object.freeze([0.01, 0.9, 0]), body: Object.freeze([0.01, 0.9, 0]), radii: Object.freeze([7, 0.85, 0.85]) }),
  shade: Object.freeze({ brain: Object.freeze([8, 0.6]), brainK: 0.75, mirror: Object.freeze([4, 0]), body: Object.freeze([4, 0]) }),
  // 18 November 2026 (SMALL, audit S23; the owner, Note 10: "If we imagine an invisible ground, the mirror body should be
  // touching the same ground"): seen from outside, both bodies hung high above a tiled floor that read as THEIR ground.
  // Under each body (its place on the floor, from the halo rows the scene gives: so it follows the mirror body wherever
  // it stands) the grout lines fade to `keep` within about `radiusM`, and the two bodies cast no floor shadow (shade
  // depth 0; the brain keeps its own): the floor reads as a distant room, not as ground under them. radiusM is about
  // the floor's own depth below the eyes (with 10 m the lines still showed 13 m out from the bodies in the view from E).
  ground: Object.freeze({ radiusM: 13, keep: 0.12 }),
  // 19 November 2026 (plain look): the backdrop's light is steady (it swelled 0.3 with the beat and 0.4 with a movement).
  live: Object.freeze({ beat: 0, beatS: 0.11, active: 0, inS: 0.25, outS: 1.2 }),
  ditherLsb: 0.75,
  // 21 November 2026 (the owner, Message 208: "Background should still be more of an abyss."): THE ABYSS (see the top
  // of this file). on: no floor, wall, lamps or shadows are drawn; false: the room above, exactly as it was.
  //  black: the darkest the abyss gets (linear light), RGB about 2, 2, 2 on the screen (the room's `black` above is
  //    4, 4, 5 and stays the room's; the scene's clear colour under the backdrop is the same 2, 2, 2).
  //  glow: the lit dark close round the three things, by the halo's own rule (rows as `aura`: [light (linear), spread
  //    (in the thing's own size), core (in its size)], and after them, if given, [from, full]: how near the view point
  //    may come, in the thing's size, before its glow goes (none nearer its middle than `from`, all of it from `full`
  //    on; the halo's own 0.7 and 1.6 when not given); `colour` its tint, a cool grey): no core, so it is brightest
  //    behind a thing's middle and falls off smoothly through its outline into the black. The bodies' are fainter than
  //    the brain's (a body is small, and from outside the brain's glow is behind it). Your own body's starts later
  //    (1.4, 2.1): the eye view's camera stands a little behind your eyes, 1.05 to 1.56 of your body's radius from its
  //    middle, and the body you are in must not light the whole view; from outside (2.2 to 2.5) it is all there.
  //  far: the wide light round the brain (thing 0): `light` (linear) x the brain's size in the view (its radius over
  //    its distance from the view point, at most `cap`) x (1 + cos a) / 2, a = the angle between the line of sight and
  //    the line to the brain's middle: the smoothest falloff there is, with no edge anywhere; full toward the brain,
  //    half at right angles to it, nothing straight away from it.
  // What the screen shows at 1600 by 900 (section 190 has the table): the start view 5 to 7 at the picture's corners
  // and 14 by the brain's outline (the room: 12 to 18 and 29); a look straight up 4 to 5 at the lower edge and 2 to 3
  // at the upper; straight down 7 to 9 at the upper edge and 4 at the lower; from outside 5 at the edges.
  // Tried in the game and dropped: a1 (the glow alone, brain [0.0045, 1.35, 0]: a broad grey lift, the start view's
  // edges 6 to 8); a2 (the glow alone, brain [0.005, 1.1, 0], your own body's with the halo's 0.7 .. 1.6: one flat 2
  // looking up, flat 2 to 3 over most of every look past the things, and in the eye view half the corners' light was
  // your own body's). Worked out with roomLight and dropped: far.light 0.005 (a look straight up 3 to 6, which shows
  // more, but the start view's corners 8 to 9) and 0.007 (the corners 10 to 12: grey again); a brain glow of spread 0.9
  // (too tight: 10 a little off the outline where 1.1 gives 13). Not built: a light fixed to the screen (a vignette
  // would not change as things come nearer or go away).
  // Display choices: a picture of a dark depth, not a model of anything.
  abyss: Object.freeze({
    on: true,
    black: Object.freeze([0.0005, 0.0005, 0.0006]),
    glow: Object.freeze({ colour: Object.freeze([0.86, 0.93, 1]), brain: Object.freeze([0.008, 1.1, 0]), mirror: Object.freeze([0.0025, 1.0, 0]), body: Object.freeze([0.0025, 1.0, 0, 1.4, 2.1]) }),
    far: Object.freeze({ light: 0.003, cap: 1 })
  })
});

const f = x => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const v3 = a => `vec3( ${f(a[0])}, ${f(a[1])}, ${f(a[2])} )`;
const AURA_KEYS = Object.freeze(['brain', 'mirror', 'body']);

/** The room's light arriving along one line of sight, in JavaScript: the same arithmetic as the shader (roomGlsl), for
 * tests and checks. eye [x, y, z] (m), dir a unit vector, st { centre: [x, z], gain, shade: [[x, z, r, depth] x 3],
 * aura: [[x, y, z, r] x 3] (brain, mirror body, your body; r 0 or a missing row: none; a row of 13 numbers carries,
 * after x, y, z, 1, the 3x3 matrix (column-major) that takes a world direction into the thing's own measure, where
 * its outline is at 1: the brain is not a ball) }.
 * Returns linear light [r, g, b] and what the line meets ('floor' | 'wall' | 'ceiling': above eye level the wall is
 * dark and the lamp plane is what shows; 'abyss' with ROOM.abyss.on: nothing). Pure. No pixel footprint: the grout is
 * drawn at full sharpness here (footM = 0) unless a footprint in metres is given. */
export function roomLight(eye, dir, st = {}, o = ROOM, footM = 0) {
  const C = st.centre || o.centre, gain = Number.isFinite(st.gain) ? st.gain : 1, shade = st.shade || [], aura = st.aura || [];
  if (isAbyss(o)) { // 21 November 2026 (Message 208): the black and the lit dark round the things, nothing else
    const K = o.abyss.black, col = [K[0], K[1], K[2]];
    auraInto(col, eye, dir, aura, o.abyss.glow, gain);
    farInto(col, eye, dir, aura[0], st.size ? st.size[0] : undefined, o.abyss, gain);
    return { colour: col, meets: 'abyss' };
  }
  const ocx = eye[0] - C[0], ocz = eye[2] - C[1], dx = dir[0], dy = dir[1], dz = dir[2];
  const a = dx * dx + dz * dz, b = ocx * dx + ocz * dz, c = ocx * ocx + ocz * ocz - o.wallR * o.wallR;
  const tW = a > 1e-7 ? (-b + Math.sqrt(Math.max(b * b - a * c, 0))) / a : 1e7;
  const tF = dy < -1e-5 ? (o.floorY - eye[1]) / dy : 1e8;
  const col = [o.black[0], o.black[1], o.black[2]];
  const add = (k, s) => { col[0] += k[0] * s; col[1] += k[1] * s; col[2] += k[2] * s; };
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const lamps = (qx, qz) => {
    let l = 0;
    const P = o.lamp;
    for (const L of o.lamps) {
      const d = Math.hypot(qx - L[0], qz - L[1]) / L[2];
      l += L[3] * (P.core * Math.exp(-(d * d) / (P.coreR * P.coreR)) + P.disc * (1 - smooth(P.discIn, P.discOut, d)) + P.halo * Math.exp(-(d * d) / (P.haloR * P.haloR)));
    }
    return l;
  };
  const wall = (h, ang) => gain * Math.exp(-Math.max(h, 0) / o.wall.heightM) * (1 - o.wall.uneven * (0.5 + 0.5 * Math.sin(ang * o.wall.lobes + 2.4 * Math.sin(ang * 3))));
  let meets;
  if (tF < tW) {
    meets = 'floor';
    const px = ocx + dx * tF, pz = ocz + dz * tF;
    let sh = 1;
    for (const s of shade) { if (!s) continue; const qx = px + C[0] - s[0], qz = pz + C[1] - s[1]; sh *= 1 - s[3] * Math.exp(-(qx * qx + qz * qz) / (s[2] * s[2])); }
    const T = o.tile.sizeM, G = o.tile.groutM;
    const dist = u => (0.5 - Math.abs(u / T - Math.floor(u / T) - 0.5)) * T;
    const cov = u => { const w = Math.max(footM, 1e-4); return Math.min(1, Math.max(0, (0.5 * G - dist(u)) / w + 0.5)) * Math.min(1, G / w); };
    let line = Math.max(cov(px), cov(pz));
    line += (2 * G / T - line) * smooth(0.25 * T, 0.7 * T, footM);
    // S23: no ground lines under a body (aura rows 1 and 2: the mirror body and your body)
    // (none for a thing the view point is in or at, i.e. your own body seen from your eyes; the halo has the same rule)
    if (o.ground) for (let i = 1; i < 3; i++) { const A = aura[i]; if (!A || !(A[3] > 0)) continue; const qx = px + C[0] - A[0], qz = pz + C[1] - A[2], away = smooth(1.0, 1.8, Math.hypot(A[0] - eye[0], A[1] - eye[1], A[2] - eye[2]) / A[3]); line *= 1 - away * (1 - o.ground.keep) * Math.exp(-(qx * qx + qz * qz) / (o.ground.radiusM * o.ground.radiusM)); }
    const pool = (o.pool.amb + (1 - o.pool.amb) * Math.exp(-(px * px + pz * pz) / (o.pool.radiusM * o.pool.radiusM))) * gain * sh;
    add(o.pool.colour, pool * (1 - o.tile.dark * line));
    const fres = o.gloss.f0 + (1 - o.gloss.f0) * Math.pow(1 + Math.max(-1, Math.min(0, dy)), 5);
    add(o.wall.colour, fres * o.gloss.wall * wall((tW - tF) * -dy, Math.atan2(ocz + dz * tW, ocx + dx * tW)));
  } else {
    meets = dy > 0 ? 'ceiling' : 'wall';
    add(o.wall.colour, wall(eye[1] + dy * tW - o.floorY, Math.atan2(ocz + dz * tW, ocx + dx * tW)));
    if (dy > 1e-4) { const tC = (o.ceilY - eye[1]) / dy; add(o.lamp.colour, gain * lamps(ocx + dx * tC, ocz + dz * tC)); }
  }
  // the lit air round the three things: brightest along a line that passes through a thing's middle
  auraInto(col, eye, dir, aura, o.aura, gain);
  return { colour: col, meets };
}
/** Whether a room rule draws the abyss (ROOM.abyss.on) instead of the room. Pure. */
export function isAbyss(o = ROOM) { return Boolean(o && o.abyss && o.abyss.on && o.abyss.glow && o.abyss.black); }
/** The abyss's black as a display colour (0xRRGGBB, sRGB), for the clear colour under the backdrop; null when the room
 * is drawn (the caller keeps its own). Pure. */
export function roomClearHex(o = ROOM) {
  if (!isAbyss(o)) return null;
  const c = o.abyss.black.map(v => Math.min(255, Math.max(0, Math.round(srgbOf(v) * 255))));
  return (c[0] << 16) | (c[1] << 8) | c[2];
}
/** How near the view point may come to a thing before its lit air goes: [from, full] in the thing's own size (none
 * with the view point nearer its middle than `from`, all of it from `full` on): a rule row's 4th and 5th numbers, or
 * the halo's own 0.7 and 1.6. Pure. */
const AURA_NEAR = Object.freeze([0.7, 1.6]);
const auraNear = rule => (rule.length >= 5 && rule[4] > rule[3] ? [rule[3], rule[4]] : AURA_NEAR);
/** Adds to col (linear) the lit air round the three things along one line of sight, by `rules` (ROOM.aura or
 * ROOM.abyss.glow: colour, brain, mirror, body). The same arithmetic as the shader's rows. Pure but for col. */
function auraInto(col, eye, dir, aura, rules, gain) {
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const dx = dir[0], dy = dir[1], dz = dir[2], k = rules.colour;
  for (let i = 0; i < 3; i++) {
    const A = aura[i], rule = rules[AURA_KEYS[i]];
    if (!A || !(A[3] > 0) || !rule) continue;
    // into the thing's own measure, where its outline is at 1: a ball of radius r, or the 3x3 matrix given after it
    const N = A.length >= 13 ? A : null, r = A[3], wx = A[0] - eye[0], wy = A[1] - eye[1], wz = A[2] - eye[2];
    const tr = (x, y, z) => (N ? [N[4] * x + N[7] * y + N[10] * z, N[5] * x + N[8] * y + N[11] * z, N[6] * x + N[9] * y + N[12] * z] : [x / r, y / r, z / r]);
    const e = tr(wx, wy, wz), d = tr(dx, dy, dz), ed = e[0] * d[0] + e[1] * d[1] + e[2] * d[2], dd = Math.max(d[0] * d[0] + d[1] * d[1] + d[2] * d[2], 1e-9), ee = e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
    const t = Math.max(ed / dd, 0), qx = e[0] - d[0] * t, qy = e[1] - d[1] * t, qz = e[2] - d[2] * t;
    // none from inside the thing, and none on a line that looks away from it (the room stays black there)
    const over = Math.max(Math.sqrt(qx * qx + qy * qy + qz * qz) - rule[2], 0), near = auraNear(rule);
    const s = gain * rule[0] * smooth(near[0], near[1], Math.sqrt(ee)) * smooth(0, 0.3, ed / Math.sqrt(Math.max(ee * dd, 1e-18))) * Math.exp(-(over * over) / (rule[1] * rule[1]));
    col[0] += k[0] * s; col[1] += k[1] * s; col[2] += k[2] * s;
  }
  return col;
}
/** A thing's size (its radius, m) for the abyss's wide light, from its row A ([x, y, z, r], or 13 numbers with the 3x3
 * matrix into its own measure after x, y, z, 1: then its largest half size, 1 / the shortest row of the matrix) unless
 * `given` (> 0) says it. 0: none. Pure. */
export function roomThingSize(A, given) {
  if (given > 0) return given;
  if (!A || !(A[3] > 0)) return 0;
  if (A.length < 13) return A[3];
  const row = i => Math.hypot(A[4 + i], A[7 + i], A[10 + i]), least = Math.min(row(0), row(1), row(2));
  return least > 0 ? 1 / least : 0;
}
/** Adds to col (linear) the abyss's wide light round the brain (ROOM.abyss.far) along one line of sight: A the brain's
 * row, size its radius (roomThingSize). The same arithmetic as the shader. Pure but for col. */
function farInto(col, eye, dir, A, size, abyss, gain) {
  if (!A || !(A[3] > 0)) return col; // no brain given: none (the shader's step on its row)
  const F = abyss.far, R = roomThingSize(A, size);
  if (!F || !(F.light > 0) || !(R > 0)) return col;
  const wx = A[0] - eye[0], wy = A[1] - eye[1], wz = A[2] - eye[2], D = Math.max(Math.hypot(wx, wy, wz), 1e-4);
  const s = gain * F.light * Math.min(R / D, F.cap) * (0.5 + 0.5 * (dir[0] * wx + dir[1] * wy + dir[2] * wz) / D), k = abyss.glow.colour;
  col[0] += k[0] * s; col[1] += k[1] * s; col[2] += k[2] * s;
  return col;
}

/** Linear light -> the display's sRGB value 0..1 (for checks of how bright the room is on screen). Pure. */
export function srgbOf(x) { const v = Math.min(1, Math.max(0, x)); return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }

/** The rows of the lit air round the three things (the shader's side of auraInto), by `rules` (ROOM.aura or
 * ROOM.abyss.glow); they add to `float au`. */
const auraRowsGlsl = rules => AURA_KEYS.map((key, i) => `	{ vec4 A = uRoomAura[ ${i} ]; vec3 e = uRoomAuraN[ ${i} ] * ( A.xyz - eye ), d = uRoomAuraN[ ${i} ] * dir; float ed = dot( e, d ), dd = max( dot( d, d ), 1e-9 ), ee = dot( e, e ); vec3 q = e - d * max( ed / dd, 0.0 ); float over = max( length( q ) - ${f(rules[key][2])}, 0.0 );
		au += ${f(rules[key][0])} * step( 0.5, A.w ) * smoothstep( ${f(auraNear(rules[key])[0])}, ${f(auraNear(rules[key])[1])}, sqrt( ee ) ) * smoothstep( 0.0, 0.3, ed * inversesqrt( max( ee * dd, 1e-18 ) ) ) * exp( - over * over / ${f(rules[key][1] * rules[key][1])} ); }`).join('\n');
/** The shader text of the room: `vec3 nsRoom( vec3 eye, vec3 dir )` (dir a unit vector) returns linear light. It reads
 * uRoom (centre x, centre z, gain, 0), uRoomShade[3] (x, z, radius, depth), uRoomAura[3] (x, y, z, 1; 0: none) and
 * uRoomAuraN[3] (world -> the thing's own measure, where its outline is at 1). The numbers are ROOM's.
 * 21 November 2026 (Message 208): with ROOM.abyss.on, the abyss: the black and the lit dark round the things only. It
 * reads uRoom (z: the gain), uRoomAura[3], uRoomAuraN[3] and uRoomSize (the three things' radii, m; 0: none); the shade
 * rows and the centre are not read. */
export function roomGlsl(o = ROOM) {
  if (isAbyss(o)) {
    const F = o.abyss.far, far = F && F.light > 0;
    return `uniform vec4 uRoom;
uniform vec4 uRoomAura[ 3 ];
uniform mat3 uRoomAuraN[ 3 ];
uniform vec3 uRoomSize;
vec3 nsRoom( vec3 eye, vec3 dir ) {
	float au = 0.0;
${auraRowsGlsl(o.abyss.glow)}${far ? `
	{ // the wide light round the brain: its size in the view x ( 1 + cos ) / 2 of the angle to it
		vec3 w = uRoomAura[ 0 ].xyz - eye; float D = max( length( w ), 1e-4 );
		au += ${f(F.light)} * step( 0.5, uRoomAura[ 0 ].w ) * min( uRoomSize.x / D, ${f(F.cap)} ) * ( 0.5 + 0.5 * dot( dir, w ) / D ); }` : ''}
	return ${v3(o.abyss.black)} + ${v3(o.abyss.glow.colour)} * ( uRoom.z * au );
}`;
  }
  const P = o.lamp;
  const lampRows = o.lamps.map(L => `	{ float d = length( q - vec2( ${f(L[0])}, ${f(L[1])} ) ) / ${f(L[2])}; float d2 = d * d;
		l += ${f(L[3])} * ( ${f(P.core)} * exp( - d2 / ${f(P.coreR * P.coreR)} ) + ${f(P.disc)} * ( 1.0 - smoothstep( ${f(P.discIn)}, ${f(P.discOut)}, d ) ) + ${f(P.halo)} * exp( - d2 / ${f(P.haloR * P.haloR)} ) ); }`).join('\n');
  const auraRows = auraRowsGlsl(o.aura);
  return `uniform vec4 uRoom;
uniform vec4 uRoomShade[ 3 ];
uniform vec4 uRoomAura[ 3 ];
uniform mat3 uRoomAuraN[ 3 ];
float nsRoomLamps( vec2 q ) {
	float l = 0.0;
${lampRows}
	return l;
}
float nsRoomWall( float h, float ang, float gain ) {
	return gain * exp( - max( h, 0.0 ) / ${f(o.wall.heightM)} ) * ( 1.0 - ${f(o.wall.uneven)} * ( 0.5 + 0.5 * sin( ang * ${f(o.wall.lobes)} + 2.4 * sin( ang * 3.0 ) ) ) );
}
float nsRoomGrout( float u, float w ) {
	float dist = ( 0.5 - abs( fract( u / ${f(o.tile.sizeM)} ) - 0.5 ) ) * ${f(o.tile.sizeM)};
	return clamp( ( ${f(0.5 * o.tile.groutM)} - dist ) / w + 0.5, 0.0, 1.0 ) * min( 1.0, ${f(o.tile.groutM)} / w );
}
vec3 nsRoom( vec3 eye, vec3 dir ) {
	vec2 C = uRoom.xy, oc = eye.xz - C;
	float gain = uRoom.z;
	float a = dot( dir.xz, dir.xz ), b = dot( oc, dir.xz ), c = dot( oc, oc ) - ${f(o.wallR * o.wallR)};
	float tW = a > 1e-7 ? ( - b + sqrt( max( b * b - a * c, 0.0 ) ) ) / a : 1e7;
	float tF = dir.y < -1e-5 ? ( ${f(o.floorY)} - eye.y ) / dir.y : 1e8;
	vec3 col = ${v3(o.black)};
	// the floor point and its pixel footprint, taken outside the branch (screen derivatives inside one are not defined)
	vec2 p = oc + dir.xz * min( tF, 1e4 );
	vec2 w = max( fwidth( p ), vec2( 1e-4 ) );
	vec2 pw = oc + dir.xz * tW;
	float ang = atan( pw.y, pw.x );
	if ( tF < tW ) {
		float sh = 1.0;
		for ( int i = 0; i < 3; i ++ ) { vec2 q = p + C - uRoomShade[ i ].xy; sh *= 1.0 - uRoomShade[ i ].w * exp( - dot( q, q ) / ( uRoomShade[ i ].z * uRoomShade[ i ].z ) ); }
		float foot = max( w.x, w.y );
		float line = max( nsRoomGrout( p.x, w.x ), nsRoomGrout( p.y, w.y ) );
		line += ( ${f(2 * o.tile.groutM / o.tile.sizeM)} - line ) * smoothstep( ${f(0.25 * o.tile.sizeM)}, ${f(0.7 * o.tile.sizeM)}, foot );
${o.ground ? `		for ( int i = 1; i < 3; i ++ ) { vec2 q = p + C - uRoomAura[ i ].xz; float away = smoothstep( 1.0, 1.8, length( uRoomAuraN[ i ] * ( uRoomAura[ i ].xyz - eye ) ) ); line *= 1.0 - step( 0.5, uRoomAura[ i ].w ) * away * ${f(1 - o.ground.keep)} * exp( - dot( q, q ) / ${f(o.ground.radiusM * o.ground.radiusM)} ); }\n` : ''}		float pool = ( ${f(o.pool.amb)} + ${f(1 - o.pool.amb)} * exp( - dot( p, p ) / ${f(o.pool.radiusM * o.pool.radiusM)} ) ) * gain * sh;
		col += ${v3(o.pool.colour)} * pool * ( 1.0 - ${f(o.tile.dark)} * line );
		float fres = ${f(o.gloss.f0)} + ${f(1 - o.gloss.f0)} * pow( 1.0 + clamp( dir.y, -1.0, 0.0 ), 5.0 );
		col += ${v3(o.wall.colour)} * ( fres * ${f(o.gloss.wall)} * nsRoomWall( ( tW - tF ) * - dir.y, ang, gain ) );
	} else {
		col += ${v3(o.wall.colour)} * nsRoomWall( eye.y + dir.y * tW - ${f(o.floorY)}, ang, gain );
		if ( dir.y > 1e-4 ) col += ${v3(o.lamp.colour)} * ( gain * nsRoomLamps( oc + dir.xz * ( ( ${f(o.ceilY)} - eye.y ) / dir.y ) ) );
	}
	float au = 0.0;
${auraRows}
	col += ${v3(o.aura.colour)} * ( gain * au );
	return col;
}`;
}

const BACKDROP_VS_CAMERA = `varying vec3 vRoomDir;
varying vec3 vRoomEye;
void main() {
	// the line of sight through this corner of the picture, in the world (the camera's own turn, without its place)
	vec3 v = vec3( ( position.x + projectionMatrix[ 2 ][ 0 ] ) / projectionMatrix[ 0 ][ 0 ], ( position.y + projectionMatrix[ 2 ][ 1 ] ) / projectionMatrix[ 1 ][ 1 ], -1.0 );
	vRoomDir = transpose( mat3( viewMatrix ) ) * v;
	vRoomEye = cameraPosition;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`;
const BACKDROP_VS_FIXED = `uniform mat3 uRoomRay;
uniform vec3 uRoomEye;
varying vec3 vRoomDir;
varying vec3 vRoomEye;
void main() {
	vRoomDir = uRoomRay * vec3( position.xy, -1.0 );
	vRoomEye = uRoomEye;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`;
const backdropFs = o => `precision highp float;
varying vec3 vRoomDir;
varying vec3 vRoomEye;
${roomGlsl(o)}
void main() {
	gl_FragColor = vec4( nsRoom( vRoomEye, normalize( vRoomDir ) ), 1.0 );
	#include <colorspace_fragment>
	float n = fract( sin( dot( floor( gl_FragCoord.xy ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) + fract( sin( dot( floor( gl_FragCoord.xy ), vec2( 39.3468, 11.1351 ) ) ) * 24634.6345 ) - 1.0;
	gl_FragColor.rgb = max( gl_FragColor.rgb + n * ${f(o.ditherLsb / 255)}, 0.0 );
}`;

/** The matrix that turns a corner of the picture (x, y in -1..1, with z = -1) into a line of sight in the world, for a
 * view with no camera object of the game's (the loading picture): a look `yawDeg` to the left and `pitchDeg` up from
 * level along -z, `fovYDeg` up and down, at `aspect` (width / height). Column-major 3x3 (9 numbers). Pure. */
export function roomRayMatrix(out, { fovYDeg, aspect, yawDeg = 0, pitchDeg = 0 }) {
  const ty = Math.tan((fovYDeg * Math.PI) / 360), tx = ty * aspect, y = (yawDeg * Math.PI) / 180, p = (pitchDeg * Math.PI) / 180;
  const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
  // the camera's axes in the world (three's 'YXZ' order: yaw about +y, then pitch about the turned x)
  const right = [cy, 0, -sy], up = [sy * sp, cp, cy * sp], back = [sy * cp, -sp, cy * cp];
  out[0] = right[0] * tx; out[1] = right[1] * tx; out[2] = right[2] * tx;
  out[3] = up[0] * ty; out[4] = up[1] * ty; out[5] = up[2] * ty;
  out[6] = back[0]; out[7] = back[1]; out[8] = back[2];
  return out;
}

/** The backdrop mesh: one triangle that covers the picture, at the far depth. With `fixed` it does not read the
 * camera: its view is set by setFixedView (the loading picture). Returns { mesh, uniforms, setFixedView, dispose }. */
export function createRoomBackdrop({ THREE, fixed = false, o = ROOM } = {}) {
  const uniforms = {
    uRoom: { value: new THREE.Vector4(o.centre[0], o.centre[1], 1, 0) },
    uRoomShade: { value: [new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0)] },
    uRoomAura: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },
    uRoomAuraN: { value: [new THREE.Matrix3(), new THREE.Matrix3(), new THREE.Matrix3()] },
    uRoomSize: { value: new THREE.Vector3(0, 0, 0) } // 21 November 2026 (the abyss): the three things' radii
  };
  if (fixed) { uniforms.uRoomRay = { value: new THREE.Matrix3() }; uniforms.uRoomEye = { value: new THREE.Vector3(0, 0, 0) }; }
  const material = new THREE.ShaderMaterial({
    name: 'ns-room backdrop (display only)', uniforms, vertexShader: fixed ? BACKDROP_VS_FIXED : BACKDROP_VS_CAMERA, fragmentShader: backdropFs(o),
    depthTest: true, depthWrite: false, toneMapped: false, fog: false
  });
  if (THREE.LessEqualDepth !== undefined) material.depthFunc = THREE.LessEqualDepth;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ns-room backdrop'; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false;
  mesh.renderOrder = ROOM_ORDER.backdrop;
  const ray = new Float32Array(9);
  function setFixedView(view) { if (!fixed) return false; roomRayMatrix(ray, view); uniforms.uRoomRay.value.fromArray(ray); if (view.eye) uniforms.uRoomEye.value.fromArray(view.eye); return true; }
  return { mesh, uniforms, setFixedView, dispose() { geometry.dispose(); material.dispose(); } };
}

/** Draw order: the backdrop is the LAST of the solid things (at the far depth, so only where nothing covers it). */
export const ROOM_ORDER = Object.freeze({ backdrop: 1e6 });

/** How bright the room's light is this frame (its gain): 1 at rest, more at the top of a beat and for a moment when a
 * movement is switched on. `beat` is the softened beat 0..1 (roomBeatStep), `level` the eased 0..1 "a movement was
 * switched on" value (roomActiveStep), both kept by the caller. Under reduced motion exactly 1, whatever it is given. Pure. */
export function roomGain(beat = 0, level = 0, o = ROOM, reducedMotion = false) {
  if (reducedMotion) return 1;
  const b = Number.isFinite(beat) ? Math.min(1, Math.max(0, beat)) : 0, l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return 1 + o.live.beat * b + o.live.active * l;
}
/** Soften the beat (a quick rise and a slower fall, 0..1) over dtS seconds, so the room's light swells with it and
 * does not flick; 0 under reduced motion. Pure. */
export function roomBeatStep(soft, beat, dtS, reducedMotion = false, o = ROOM) {
  if (reducedMotion) return 0;
  const b = Number.isFinite(beat) ? Math.min(1, Math.max(0, beat)) : 0;
  if (!(dtS > 0)) return soft;
  return soft + (b - soft) * (1 - Math.exp(-dtS / o.live.beatS));
}
/** Ease the "a movement was switched on" level toward 1 (on) or 0 (off) over dtS seconds. Under reduced motion it
 * stays 0: the room's light does not answer at all. Pure. */
export function roomActiveStep(level, on, dtS, reducedMotion = false, o = ROOM) {
  if (reducedMotion) return 0;
  const target = on ? 1 : 0;
  if (!(dtS > 0)) return level;
  const tau = target > level ? o.live.inS : o.live.outS, n = level + (target - level) * (1 - Math.exp(-dtS / tau));
  return Math.abs(target - n) < 0.004 ? target : n;
}

/** The room for the game's scene. Returns { group (add it to the scene), update(frame), setCentre(x, z), state(),
 * dispose() }. update({ dtMs, beat, active, brain, brainShape, mirror, body }): beat 0..1 and
 * active (a movement switched on) from the living brain; brain / mirror / body = world places [x, y, z] or
 * [x, y, z, radius] (or null) for the floor shadows and the halos; brainShape = 9 numbers (a 3x3 matrix, column-major)
 * from the world into the brain's own measure where its outline is at 1 (the brain is not a ball), or null.
 * Writes a handful of uniforms: no allocation. (21 November 2026: with ROOM.abyss.on the same places and sizes feed the
 * abyss's glow and wide light; state() then reports abyss: true, no shadows, and each thing's own measure as `shape`.) */
export function createRoom({ THREE, reducedMotion = false, o = ROOM } = {}) {
  const group = new THREE.Group();
  group.name = 'ns-room (display only)'; group.matrixAutoUpdate = false;
  const backdrop = createRoomBackdrop({ THREE, o });
  group.add(backdrop.mesh);
  const U = backdrop.uniforms, shade = U.uRoomShade.value, aura = U.uRoomAura.value, auraN = U.uRoomAuraN.value, auraR = [0, 0, 0], size = U.uRoomSize.value;
  let level = 0, soft = 0, centreSet = false;
  const ok = p => p && p.length >= 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
  // one thing: its floor shadow (x, z, radius, depth) and its halo (x, y, z, radius)
  // (p: [x, y, z] or [x, y, z, radius]; shape: 9 numbers, the 3x3 matrix (column-major) from the world into the thing's
  // own measure, for a thing that is not a ball)
  const put = (i, p, rule, shadeR, shape) => {
    if (!ok(p)) { shade[i].w = 0; aura[i].w = 0; auraR[i] = 0; size.setComponent(i, 0); return; }
    const r = p.length >= 4 && p[3] > 0 ? p[3] : o.aura.radii[i];
    shade[i].set(p[0], p[2], shadeR > 0 ? shadeR * r : rule[0], rule[1]);
    aura[i].set(p[0], p[1], p[2], 1); auraR[i] = r; size.setComponent(i, r);
    const m = auraN[i].elements;
    if (shape && shape.length >= 9) for (let k = 0; k < 9; k++) m[k] = shape[k];
    else { m[0] = m[4] = m[8] = 1 / r; m[1] = m[2] = m[3] = m[5] = m[6] = m[7] = 0; }
  };
  function setCentre(x, z) { if (!Number.isFinite(x) || !Number.isFinite(z)) return false; U.uRoom.value.x = x; U.uRoom.value.y = z; centreSet = true; return true; }
  function update(fr) {
    const dtS = fr && fr.dtMs > 0 ? Math.min(0.25, fr.dtMs / 1000) : 0;
    level = roomActiveStep(level, Boolean(fr && fr.active > 0), dtS, reducedMotion, o);
    soft = roomBeatStep(soft, fr ? fr.beat : 0, dtS, reducedMotion, o);
    U.uRoom.value.z = roomGain(soft, level, o, reducedMotion);
    // the light's axis is where the brain FIRST stands; it stays there (a lamp does not follow what is moved under it)
    if (!centreSet && fr && ok(fr.brain)) setCentre(fr.brain[0], fr.brain[2]);
    put(0, fr && fr.brain, o.shade.brain, fr && fr.brain && fr.brain.length >= 4 && fr.brain[3] > 0 ? o.shade.brainK : 0, fr && fr.brainShape);
    put(1, fr && fr.mirror, o.shade.mirror, 0, null); put(2, fr && fr.body, o.shade.body, 0, null);
  }
  const r3 = v => Math.round(v * 1000) / 1000;
  function state() {
    const r = U.uRoom.value, room = !isAbyss(o); // (the abyss draws no floor: no shadow is on anything)
    return { centre: [r.x, r.y], centreSet, gain: r3(r.z), beat: r3(soft), active: r3(level), dust: 0,
      shadows: [room && shade[0].w > 0, room && shade[1].w > 0, room && shade[2].w > 0],
      things: aura.map((a, i) => (a.w > 0 ? { at: [r3(a.x), r3(a.y), r3(a.z)], radiusM: r3(auraR[i]), shadowM: r3(shade[i].z), shape: Array.from(auraN[i].elements, r3) } : null)),
      abyss: isAbyss(o), reducedMotion };
  }
  function dispose() { backdrop.dispose(); }
  return { group, update, setCentre, state, dispose };
}
