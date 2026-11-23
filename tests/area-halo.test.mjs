/**
 * The glow of the motor strip that needs no extra pass (ns-area-halo; section 191).
 *
 * The owner, 21 November 2026: "The glow needs to be fixed, and the glow for the black parts of the motor strip also
 * need to be fixed. Right now, there's essentially no glow, and it's too much before as well." Message 208: "The black
 * motor parts should have some edge glow."
 *
 * Checks on the pure rules and on the shader text: the strengths, the block's shape, the halo's state (it eases, it
 * ends, it costs nothing while nothing glows), the colours of a lit and of a looked-at block, the black blocks' states
 * (no white flare for an area without a movement), the tint that follows the look. Nothing is drawn here, so these
 * cannot show what the glow looks like; the pictures and the measured colours are in section 191.
 *
 * Run: node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {
  AREA_HALO, AREA_LIT, LOOK_GLOW, ABYSS_EDGE, NO_FLARE, KEY_PRESS, CLICK_GLOW, abyssEdgeLinear, areaFlares, shownActivity, haloParts, pickTintWant, keyPressed, clickedArea, clickGlow,
  blockSamplePoints, haloShape, haloFitWidths, haloDistance, haloFalloff, createHalo, haloSet, stepHalo, writeHaloUniforms, areaHaloState, areaHaloRecords,
  haloFragmentHead, haloTissueGlsl, patchAreaHaloShaders, haloAt, haloTissueInto, HALO_SKIP, HALO_EDGE, HALO_DIST, HALO_FALLOFF
} from '../scene/src/ns-area-halo.mjs';
import { readFileSync } from 'node:fs';
import { REGION_BORDER, regionDisplayStyle, patchRegionBorderShaders, patchGlassReadShaders, patchGlowRimShaders, patchPowerUpShaders, isScanArea, BRAIN_PICK_TINT, HDR_BLOOM } from '../scene/src/ns-scene-three.mjs';
import { patchAreaInkShaders, cortexFleshGlsl, brainPickGainInto, BRAIN_KEYS } from '../scene/src/ns-brain-ink.mjs';
import { BRAIN_LIVE } from '../scene/src/ns-brain-live.mjs';
import { AREA_LOOK, AREA_COLORS, areaRecord, glowIntensity } from '../scene/src/ns-colors.mjs';
import { BODY_MOTOR_MAP } from '../scene/src/ns-bodymap.mjs';
import { createActivity } from '../scene/src/ns-actions.mjs';

const region = id => BODY_MOTOR_MAP.regions.find(r => r.id === id);
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** A band across a gyrus: 4 mm wide along x (the strip), its crown from y -5 to 5 at z 0, bent like a V (bend mm of x
 * per mm of |y|), with banks going down 14 mm at y = +-5. Returns { pts, depth, s }. */
function band({ bend = 0, x0 = 0, width = 4, sPerMm = 0.01 } = {}) {
  const pts = [], depth = [], s = [];
  for (let i = 0; i <= 16; i++) for (let j = -20; j <= 20; j++) {
    const y = j * 0.25, off = bend * Math.abs(y), x = x0 + off + i * width / 16;
    pts.push(x, y, 0); depth.push(0.1 * Math.abs(y)); s.push(0.2 + sPerMm * (x - x0 - off));
  }
  for (let i = 0; i <= 16; i++) for (let k = 1; k <= 28; k++) for (const sg of [-1, 1]) {
    const off = bend * 5, x = x0 + off + i * width / 16;
    pts.push(x, sg * (5 + 0.05 * k), -0.5 * k); depth.push(0.5 + 0.5 * k); s.push(0.2 + sPerMm * (x - x0 - off));
  }
  return { pts, depth, s };
}

test('the look gives about a third of a contraction\'s halo; a held posture gives none; a grip gives the look\'s', () => {
  assert.equal(AREA_HALO.lit, 1);
  // (22 November 2026: 0.3 to 0.6 before the second check; with the neighbouring blocks taking none of the look, the
  // lead asked for a glow seen at a glance round a looked-at block: up to 0.85)
  assert.ok(AREA_HALO.look >= 0.3 && AREA_HALO.look <= 0.85, 'looked-at is a third to most of lit');
  assert.ok(AREA_HALO.easeS >= 0.1 && AREA_HALO.easeS <= 0.25, 'the look\'s halo comes and goes over about 0.15 s');
  assert.deepEqual(haloParts({ glow: 0, looked: false }), { lit: 0, look: 0 });
  assert.deepEqual(haloParts({ glow: 0, looked: true }), { lit: 0, look: AREA_HALO.look }, 'a look alone: the look\'s part, no lit part');
  assert.deepEqual(haloParts({ glow: 1, looked: true }), { lit: 1, look: AREA_HALO.look });
  assert.equal(haloParts({ glow: 0.5 }).lit, 0.5, 'the lit part follows the glow (it ends with the contraction)');
  assert.equal(haloParts({ glow: 1, posture: true }).lit, 0, 'a held posture\'s calm light throws no halo');
  assert.equal(haloParts({ glow: 1, held: true }).lit, AREA_HALO.held, 'a Space grip: a soft halo while it holds');
  assert.ok(AREA_HALO.held <= 0.5);
  assert.equal(haloParts({ glow: NaN, looked: false }).lit, 0);
  // a black block: never a lit part, and a softer look part (its pale colour lightens its neighbours more)
  assert.deepEqual(haloParts({ glow: 1, looked: true, scan: true }), { lit: 0, look: AREA_HALO.look * ABYSS_EDGE.halo });
  assert.ok(ABYSS_EDGE.halo > 0.3 && ABYSS_EDGE.halo < 1);
  const T = AREA_HALO.tissue;
  assert.ok(T.mix >= 0.4 && T.mix <= 1 && AREA_HALO.strip.add > 0.3 && AREA_HALO.strip.add <= 1);
  // (22 November 2026: none at first; then a narrow band of it, far under the lit part's reach, so the neighbours keep
  // their own colour beyond it)
  assert.ok(AREA_HALO.strip.look <= 0.7 && AREA_HALO.strip.lookReachMm > 0 && AREA_HALO.strip.lookReachMm <= 2 && AREA_HALO.strip.lookReachMm < AREA_HALO.reachMinMm / 4,
    'a neighbouring block takes the look\'s part only in a narrow band past the block\'s edge');
});

test('a black block (and an area with no movement) moves nothing, so it is never drawn switched on; every other area flares as before', () => {
  for (const r of BODY_MOTOR_MAP.regions) {
    const scan = isScanArea(r);
    const flares = !scan && Array.isArray(r.actions) && r.actions.length > 0;
    assert.equal(scan, /_scan_/.test(r.id), r.id);
    assert.equal(areaFlares(r, scan), flares, r.id);
    assert.equal(shownActivity(1, r, scan), flares ? 1 : 0, r.id);
    assert.equal(shownActivity(0.4, r, scan), flares ? 0.4 : 0);
  }
  assert.equal(shownActivity(NaN, region('lh_knee'), false), 0);
  // 22 November 2026: every area without a movement (the tongue areas too) is never drawn switched on; every area
  // with one flares as before (the left shoulder, which moves the game arm, among them)
  assert.equal(NO_FLARE.noMovement, true);
  for (const r of BODY_MOTOR_MAP.regions) {
    const moves = Array.isArray(r.actions) && r.actions.length > 0;
    assert.equal(areaFlares(r, isScanArea(r)), moves, r.id);
  }
  assert.equal(areaFlares(region('rh_tongue'), false), false, 'the tongue does not flare');
  assert.equal(shownActivity(1, region('lh_tongue'), false), 0);
  assert.equal(areaFlares(region('rh_tongue'), false, { scan: true, noMovement: false }), true, 'the old rule behind the switch');
  assert.equal(areaFlares(region('rh_shoulder'), false), true);
  // drawn with activity 0, a black block has no white fill and no light of the lit kind, looked at or not, tried or not
  for (const id of ['rh_scan_superior', 'lh_scan_middle', 'rh_scan_inferior']) {
    for (const hovered of [false, true]) for (const n of [0, 2]) {
      const s = regionDisplayStyle(region(id), { activity: shownActivity(1, region(id), true), activatedCount: n, hovered });
      assert.equal(s.glow, 0, `${id}: no glow strength`);
      assert.ok(Math.max(...s.emission) < 0.01 && Math.max(...s.albedo) < 0.01 && Math.max(...s.rim) === 0, `${id}: it stays the abyss's black`);
    }
    // what it showed before, for the record: full white, above display white
    assert.ok(Math.min(...regionDisplayStyle(region(id), { activity: 1 }).emission) >= 1.5);
  }
});

test('the black blocks\' edge glow: cool, pale, quiet at rest, brighter and wider under the look', () => {
  assert.equal(ABYSS_EDGE.on, true);
  const c = abyssEdgeLinear();
  assert.ok(c[2] > c[1] && c[1] > c[0], 'a cool colour');
  assert.ok(Math.max(...ABYSS_EDGE.colour) >= 220 && Math.min(...ABYSS_EDGE.colour) >= 100, 'a light colour, not a grey: blue well above red');
  assert.ok(ABYSS_EDGE.colour[2] - ABYSS_EDGE.colour[0] >= 80);
  assert.equal(ABYSS_EDGE.face, 0, 'no glow along the outline as seen: it made a streak on the coarse bank');
  assert.ok(ABYSS_EDGE.framePx > 0.5 && ABYSS_EDGE.framePx < REGION_BORDER.hoverPx, 'the frame under the look is narrower than the white hover frame');
  assert.ok(ABYSS_EDGE.rest > 0.25 && ABYSS_EDGE.rest < ABYSS_EDGE.look && ABYSS_EDGE.look <= 1, 'at rest plainly there, under the look brighter');
  // (22 November 2026: at most 6 px before the second check, which found the rest edge a thin dark line: up to 10)
  assert.ok(ABYSS_EDGE.css >= 3 && ABYSS_EDGE.css <= 10 && ABYSS_EDGE.lookCss > ABYSS_EDGE.css, 'a few CSS pixels wide; wider under the look');
  assert.equal(ABYSS_EDGE.falloffPower, 1, 'a linear falloff: the light shows past the gap\'s cover');
  assert.ok(ABYSS_EDGE.rest >= 0.7, 'at rest it reads as light, not a dark line');
  assert.ok(ABYSS_EDGE.share < 0.5, 'a narrow block keeps a black middle');
  // quieter than a coloured block: its brightest point at rest is under the resting light of the strip's middle block
  const rest = Object.keys(AREA_COLORS).filter(id => !/_scan_/.test(id)).map(id => lum(areaRecord(id).colorLinear) * (0.76 + AREA_LOOK.restLift)).sort((a, b) => a - b);
  assert.ok(lum(c) * ABYSS_EDGE.rest < rest[Math.floor(rest.length / 2)], 'under the middle coloured block at rest');
});

test('a block\'s shape is a band over the crown and down both banks, as wide as the block', () => {
  for (const bend of [0, 0.6]) {
    const b = band({ bend }), sh = haloShape(b.pts, b.depth, b.s);
    assert.equal(sh.kind, 'band');
    assert.equal(sh.p.length, 5);
    assert.ok(Math.abs(sh.width - 4) < 0.7, `bend ${bend}: width ${sh.width.toFixed(2)} of 4 mm`);
    assert.ok(sh.p[0][2] < -6 && sh.p[4][2] < -6 && sh.p[0][1] * sh.p[4][1] < 0, 'the two ends are down the two banks');
    assert.ok(Math.abs(sh.p[2][1]) < 0.5 && sh.p[2][2] > -0.5, 'the middle point is on the crown\'s middle');
    assert.ok(sh.p[1][1] * sh.p[3][1] < 0 && Math.abs(sh.p[1][1]) > 3.5 && Math.abs(sh.p[3][1]) > 3.5, 'the shoulders are at the crown\'s two edges');
    // a bent band is followed: its middle point lies on the band where it is, not on the straight line between the shoulders
    assert.ok(Math.abs(sh.p[2][0] - (2 + bend * 0.6)) < 0.8, `bend ${bend}: middle at x ${sh.p[2][0].toFixed(2)}`);
    assert.ok(sh.reach >= AREA_HALO.reachMinMm && sh.reach <= AREA_HALO.reachMaxMm);
    // on the block: no distance; beside it along the strip: the distance past its edge; the falloff runs 1 -> 0 over the reach
    const mid = sh.p[2];
    assert.equal(haloDistance(sh, mid), 0);
    assert.equal(haloFalloff(sh, mid), 1);
    let last = 1;
    for (let d = 0; d <= sh.reach + 3; d += 0.5) {
      const f = haloFalloff(sh, [mid[0] + sh.r + d, mid[1], mid[2]]);
      assert.ok(f <= last + 1e-12 && f >= 0, 'never rising with distance');
      last = f;
    }
    assert.equal(last, 0, 'gone past the reach');
    const half = haloFalloff(sh, [mid[0] + sh.r + sh.reach / 2, mid[1], mid[2]]);
    assert.ok(half > 0.15 && half < 0.4, `a quarter at half the reach, about (${half.toFixed(2)})`);
    // the neighbouring block's bank takes the pool too (the shape goes down the banks)
    assert.ok(haloFalloff(sh, [mid[0] + sh.r + 1, 5.5, -6]) > 0.5);
  }
  // reach: reachWidths block widths, held between its two limits
  const wide = band({ width: 12 }), w = haloShape(wide.pts, wide.depth, wide.s);
  assert.equal(w.reach, AREA_HALO.reachMaxMm);
  const thin = band({ width: 2 }), t = haloShape(thin.pts, thin.depth, thin.s);
  assert.equal(t.reach, AREA_HALO.reachMinMm);
  // without depth and strip coordinate: one segment along the points' spread
  const seg = haloShape(band().pts.slice(0, 3 * 17 * 41));
  assert.equal(seg.kind, 'segment');
  assert.ok(Math.abs(seg.width - 4) < 1 && seg.length > 8);
  assert.equal(haloShape([0, 0, 0, 1, 1, 1]), null);
  assert.equal(haloShape(null), null);
});

test('every block\'s width is held to the strip\'s own scale', () => {
  const shapes = [];
  for (let i = 0; i < 7; i++) { const b = band({ width: 3 + i * 0.5, x0: 10 * i }); shapes.push(haloShape(b.pts, b.depth, b.s)); }
  const odd = band({ width: 4 }), wrong = haloShape(odd.pts, odd.depth, odd.s);
  wrong.width = 16; wrong.r = 8; wrong.reach = 16; // as measured near the midline, where the strip coordinate does not rise steadily
  const tiny = haloShape(odd.pts, odd.depth, odd.s);
  tiny.width = 1; tiny.r = 0.5;
  const scale = haloFitWidths([...shapes, wrong, tiny, null]);
  assert.ok(scale > 80 && scale < 125, `mm per unit of the strip coordinate: ${scale}`);
  assert.ok(wrong.width <= AREA_HALO.fitHi * wrong.run * scale + 1e-9 && wrong.width < 7 && wrong.r === wrong.width / 2);
  assert.ok(wrong.reach < 16);
  assert.ok(tiny.width >= AREA_HALO.fitLo * tiny.run * scale - 1e-9 && tiny.width > 2);
  for (const sh of shapes) assert.ok(Math.abs(sh.width / sh.run / scale - 1) < 0.4, 'a block that measures right is left alone');
  assert.equal(haloFitWidths([wrong]), null, 'too few blocks to say');
});

test('the strip\'s triangles are sampled into the blocks that own them', () => {
  // a 2 x 1 strip of four triangles, strip coordinate along x: 0 .. 1; two owners split at 0.5
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1, 0, 1, 1, 0, 2, 1, 0]);
  const indices = [0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4], s = [0, 0.5, 1, 0, 0.5, 1], A = { id: 'a' }, B = { id: 'b' };
  const rows = [[{ lo: 0, hi: 0.5, owner: A }, { lo: 0.5, hi: 1, owner: B }]];
  const out = blockSamplePoints([{ positions, indices, s, depth: [0, 0, 0, 2, 2, 2], row: 0 }], rows);
  assert.deepEqual([...out.keys()], [A, B]);
  const a = out.get(A), b = out.get(B);
  assert.equal(a.pts.length / 3, a.depth.length); assert.equal(a.s.length, a.depth.length);
  for (let i = 0; i < a.s.length; i++) assert.ok(a.s[i] < 0.5 && a.pts[3 * i] < 1);
  for (let i = 0; i < b.s.length; i++) assert.ok(b.s[i] >= 0.5 && b.pts[3 * i] >= 1);
  assert.ok(a.depth.some(d => d > 0 && d < 2), 'the depth is carried between the corners');
  assert.equal(blockSamplePoints([{ positions, indices, s, row: 3 }], rows).size, 0, 'a part with no row gives nothing');
});

test('the halo\'s state: the look\'s part eases in and out, the lit part is as given, a spent halo frees its slot', () => {
  const sh = haloShape(band().pts, band().depth, band().s);
  const H = createHalo();
  const U = { p: new Float32Array(20 * H.slots), c: new Float32Array(4 * H.slots), n: new Float32Array(4) };
  // nothing glows: one comparison per slot, nothing to write
  H.dirty = false;
  assert.equal(stepHalo(H, 1 / 60), false);
  assert.equal(H.n, 0);
  // the look comes to rest on an area
  assert.equal(haloSet(H, 'rh_elbow', sh, 0.002, 0.365, 1, 0, AREA_HALO.look, 7), 0);
  let last = 0;
  for (let i = 0; i < 9; i++) { assert.equal(stepHalo(H, 1 / 60), true); assert.ok(H.look[0] > last && H.look[0] <= AREA_HALO.look, 'it rises, never past its level (no pulse)'); last = H.look[0]; }
  assert.ok(last > 0.55 * AREA_HALO.look && last < 0.7 * AREA_HALO.look, `after 0.15 s: ${(last / AREA_HALO.look).toFixed(2)} of its level`);
  for (let i = 0; i < 60; i++) stepHalo(H, 1 / 60);
  assert.equal(H.look[0], AREA_HALO.look);
  assert.equal(H.easing, false);
  assert.equal(stepHalo(H, 1 / 60), false, 'steady: nothing is written');
  writeHaloUniforms(H, U);
  assert.equal(U.n[0], 1);
  assert.ok(Math.abs(U.c[2] - AREA_HALO.look) < 1e-6 && Math.abs(U.c[1] - 0.365 * AREA_HALO.look) < 1e-6, 'colour x strength');
  assert.equal(U.c[3], 7, 'the area\'s own number goes along (its own block takes none of its halo)');
  assert.ok(Math.abs(U.p[3] - sh.r) < 1e-6 && Math.abs(U.p[7] - 1 / sh.reach) < 1e-6);
  for (let k = 0; k < 5; k++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(U.p[4 * k + j] - sh.p[k][j]) < 1e-5);
  // the contraction: the lit part at once, as given; and gone at once when it ends, down to the look's part
  haloSet(H, 'rh_elbow', sh, 0.002, 0.365, 1, 1, AREA_HALO.look, 7);
  assert.equal(stepHalo(H, 1 / 60), true);
  writeHaloUniforms(H, U);
  assert.ok(Math.abs(U.c[2] - 1) < 1e-6, 'the lit halo is not eased here');
  haloSet(H, 'rh_elbow', sh, 0.002, 0.365, 1, 0, AREA_HALO.look, 7);
  stepHalo(H, 1 / 60); writeHaloUniforms(H, U);
  assert.ok(Math.abs(U.c[2] - AREA_HALO.look) < 1e-6, 'after the contraction the look\'s soft glow remains');
  // the look leaves: it eases out and the slot is freed
  haloSet(H, 'rh_elbow', sh, 0.002, 0.365, 1, 0, 0, 7);
  last = AREA_HALO.look;
  for (let i = 0; i < 9; i++) { stepHalo(H, 1 / 60); assert.ok(H.look[0] < last); last = H.look[0]; }
  for (let i = 0; i < 90; i++) stepHalo(H, 1 / 60);
  assert.equal(H.id[0], null); assert.equal(H.n, 0);
  writeHaloUniforms(H, U);
  assert.equal(U.n[0], 0, 'the shaders skip the halo altogether');
  assert.ok(U.c.every(v => v === 0));
  // an area that never had a halo and wants none takes no slot
  assert.equal(haloSet(H, 'lh_knee', sh, 1, 1, 0, 0, 0), -1);
  // under reduced motion the look's part is there at once (steady light)
  const R = createHalo({ reducedMotion: true });
  haloSet(R, 'a', sh, 1, 0, 0, 0, AREA_HALO.look);
  stepHalo(R, 1 / 60);
  assert.equal(R.look[0], AREA_HALO.look);
});

test('with more halos than slots the weakest is left out; the QA record is filled in place', () => {
  const sh = haloShape(band().pts, band().depth, band().s);
  const H = createHalo({ slots: 3 });
  for (const id of ['a', 'b', 'c']) assert.ok(haloSet(H, id, sh, 1, 0.5, 0, 0, AREA_HALO.look) >= 0);
  for (let i = 0; i < 90; i++) stepHalo(H, 1 / 60);
  assert.equal(haloSet(H, 'd', sh, 0, 0, 1, 0, 0.1), -1, 'a fainter one finds no slot');
  const s = haloSet(H, 'e', sh, 0, 0, 1, 1, 0);
  assert.ok(s >= 0 && H.id[s] === 'e', 'a lit one takes the place of a looked-at one');
  stepHalo(H, 1 / 60);
  const rec = areaHaloRecords(3), same = areaHaloState(H, rec);
  assert.equal(same, rec);
  const e = rec.find(r => r.id === 'e');
  assert.ok(e && e.lit === 1 && e.strength === 1 && e.b === 1 && Math.abs(e.widthMm - sh.width) < 1e-9 && Math.abs(e.reachMm - sh.reach) < 1e-9);
});

test('a lit block: white-hot in its middle, its own colour at its rim; a looked-at block is not dimmed by "visited"', () => {
  assert.equal(AREA_LOOK.areaWhite, 1, 'the core stays white (Messages 159, 203)');
  assert.equal(AREA_LIT.on, true);
  for (const id of ['rh_elbow', 'lh_knee', 'lh_wrist', 'rh_toes']) {
    const lit = regionDisplayStyle(region(id), { activity: 1, activatedCount: 1, hovered: true });
    assert.ok(Math.min(...lit.emission) >= 1, `${id}: the core is at or above display white on every channel`);
    assert.ok(Math.abs(lit.emission[0] - lit.emission[1]) < 1e-9 && Math.abs(lit.emission[1] - lit.emission[2]) < 1e-9, 'white');
    // the fresnel rim carries the area's own hue (it was white x 2)
    const g = areaRecord(id).glowLinear, hi = g.indexOf(Math.max(...g)), lo = g.indexOf(Math.min(...g));
    assert.ok(lit.rim[hi] > 4 * lit.rim[lo] + 0.1, `${id}: rim ${lit.rim.map(v => v.toFixed(2))}`);
    // tried before or not, the block under the look shows the same full colour and self-light
    const fresh = regionDisplayStyle(region(id), { activity: 0, activatedCount: 0, hovered: true });
    const tried = regionDisplayStyle(region(id), { activity: 0, activatedCount: 3, hovered: true });
    for (let i = 0; i < 3; i++) { assert.ok(Math.abs(fresh.albedo[i] - tried.albedo[i]) < 1e-12); assert.ok(Math.abs(fresh.emission[i] - tried.emission[i]) < 1e-12); }
    // and when the look leaves, the visited dimming is back (the marking is untouched)
    const left = regionDisplayStyle(region(id), { activity: 0, activatedCount: 3, hovered: false });
    assert.ok(lum(left.albedo) < 0.35 * lum(fresh.albedo) && lum(left.emission) < 0.2 * lum(fresh.emission));
    assert.ok(lum(tried.emission) > 1.9 * lum(regionDisplayStyle(region(id), { activity: 0, activatedCount: 0 }).emission), 'under the look: twice an untried block\'s resting self-light');
  }
  assert.equal(LOOK_GLOW.unvisit, true);
  // the rim is the area's own colour as it is, at the screen's full brightness: the keys' frame adds no multiple of it
  assert.equal(BRAIN_KEYS.frameGain, 0);
  assert.ok(AREA_LIT.rimGain >= 1 && AREA_LIT.rimGain <= 1.3, 'a little above display white on its brightest channel, its hue whole');
  assert.ok(AREA_LIT.rimShare < 0.5, 'a narrow block keeps a white middle');
});

test('the whole-brain tint follows the look, a contraction first; it stays a faint gain', () => {
  assert.ok(BRAIN_PICK_TINT.look > 0 && BRAIN_PICK_TINT.look <= 1);
  assert.deepEqual(pickTintWant(null, 0, null), { id: null, share: 0 });
  assert.deepEqual(pickTintWant(null, 0, 'rh_elbow', 1), { id: 'rh_elbow', share: 1 }, 'for as long as the look rests there');
  assert.deepEqual(pickTintWant('lh_knee', 0.3, 'rh_elbow', 1), { id: 'lh_knee', share: 0.5 }, 'a lit area comes first, by its level');
  assert.deepEqual(pickTintWant('lh_knee', 0.9, null, 1), { id: 'lh_knee', share: 1 });
  assert.deepEqual(pickTintWant(null, 0, 'rh_elbow', 0), { id: null, share: 0 }, 'the switch: a look gives none');
  const out = { id: 'x', share: 9 };
  assert.equal(pickTintWant(null, 0, null, 1, out), out);
  // faint: the gain on any channel of the cortex is under a fifth for every area (a black block gives none: the scene
  // passes no colour for it)
  const g = [0, 0, 0];
  for (const id of Object.keys(AREA_COLORS)) {
    brainPickGainInto(g, areaRecord(id).glowLinear, BRAIN_PICK_TINT.look);
    assert.ok(Math.max(...g.map(Math.abs)) < 0.2, `${id}: ${g.map(v => v.toFixed(3))}`);
  }
  assert.deepEqual(brainPickGainInto(g, null, 1), [0, 0, 0]);
});

test('the halo\'s shader text: one rule for the cortex and the areas, nothing while no halo is on, no pow', () => {
  const head = haloFragmentHead();
  assert.ok(head.includes(`uniform vec4 nsHaloP[ ${5 * AREA_HALO.slots} ]`) && head.includes(`uniform vec4 nsHaloC[ ${AREA_HALO.slots} ]`) && head.includes('vec3 nsHaloAt( vec3 p, float self, float litOnly )'));
  assert.ok(head.includes('if ( i >= n ) break;'), 'only the slots in use are read');
  assert.ok(!head.includes('pow('));
  const tissue = haloTissueGlsl('vNsObj', 'nsCol', 'nsFacing');
  assert.ok(tissue.startsWith('if ( nsHaloN.x > 0.5 )'), 'skipped altogether while no halo is on');
  assert.ok(tissue.includes('nsHaloAt( vNsObj, - 1.0, 0.0 )') && !tissue.includes('pow('), 'the tissue takes the whole halo, look and lit');
  // the cortex: the halo is in the tissue's colour before it is cut at white; the bloom's own spill and its light above white are out
  const flesh = cortexFleshGlsl([0.6, 1.5, 1.8]);
  assert.ok(flesh.includes('nsHaloAt( vNsObj, - 1.0, 0.0 )'));
  assert.ok(flesh.indexOf('nsHaloAt(') < flesh.indexOf('outgoingLight = min( nsCol, vec3( 1.0 ) )'));
  assert.ok(flesh.includes(`nsLvK * ( 0.0 * nsLvA )`), 'no light above white round the key (it showed only where the bloom pass runs)');
  const off = cortexFleshGlsl([0.6, 1.5, 1.8], undefined, undefined, {}, { ...AREA_HALO, on: false });
  assert.ok(!off.includes('nsHaloAt(') && off.includes(`nsLvK * ( ${BRAIN_LIVE.bloom.glow} * nsLvA )`), 'the switch gives the old tissue bloom back');
  const lib = THREE.ShaderLib.physical;
  const glass = patchGlassReadShaders(lib.vertexShader, lib.fragmentShader);
  assert.ok(glass && glass.fragmentShader.includes('uniform vec4 nsHaloN;') && glass.fragmentShader.split('vec3 nsHaloAt(').length === 2);
  // the halo does not depend on the bloom pass
  assert.equal(HDR_BLOOM.offFromLevel, 1, 'the bloom is still the first thing the quality controller drops');
});

test('the area patch composes on the real area shader: rim, halo and edge glow, each where its values are in scope', () => {
  const lib = THREE.ShaderLib.physical;
  assert.equal(patchAreaHaloShaders('void main() {}', 'void main() {}'), null, 'no hooks: the area draws as before');
  assert.equal(patchAreaHaloShaders(null, null), null);
  // without the border patch: rim (down the banks only, when the relief is there) and halo, no edge glow
  const plain = patchAreaHaloShaders(lib.vertexShader, lib.fragmentShader);
  assert.ok(plain && plain.rim && plain.halo && !plain.edge && !plain.border);
  assert.ok(plain.vertexShader.includes('vNsHp = position;'));
  // the real chain: border, glow rim, power-up, ink, then the halo
  const b = patchRegionBorderShaders(lib.vertexShader, lib.fragmentShader);
  const r = patchGlowRimShaders(b.vertexShader, b.fragmentShader);
  const pu = patchPowerUpShaders(r.vertexShader, r.fragmentShader, 'area');
  const ink = patchAreaInkShaders(pu.vertexShader, pu.fragmentShader, THREE.ShaderChunk.lights_physical_pars_fragment);
  const p = patchAreaHaloShaders(ink.vertexShader, ink.fragmentShader);
  assert.ok(p && p.rim && p.halo && p.edge && p.border);
  const fs = p.fragmentShader;
  assert.ok(!fs.includes('undefined') && !fs.includes('NaN'));
  assert.equal(fs.split('vec3 nsHaloAt(').length - 1, 1);
  // the rim comes after the power-up's flash and before the lights, so the keys' frame takes its colour
  const light = fs.indexOf('#include <lights_fragment_begin>'), rim = fs.indexOf('AREA_LIT'), flash = fs.indexOf('nsPu.x');
  assert.ok(flash > 0 && rim > flash && rim < light);
  assert.ok(fs.includes('smoothstep( 1.5, 5.0, vNsRel )'), 'and down the banks');
  // the halo and the edge glow are added to the finished colour, after the keys' own light, press and focus rules
  const opaque = fs.indexOf('#include <opaque_fragment>'), halo = fs.indexOf('AREA_HALO: the other areas'), edge = fs.indexOf('ABYSS_EDGE: a black block'), press = fs.indexOf('the press: a dark frame');
  assert.ok(press > 0 && halo > press && edge > halo && edge < opaque);
  // a block takes none of its own halo; the gap between blocks and a black block take none at all
  assert.ok(fs.includes('nsHaloAt( vNsHp, nsHaloSet.x, 1.0 )') && fs.includes('nsHaloN.x > 0.5 && nsHaloSet.z < 0.5') && fs.includes('* ( 1.0 - nsGapCov )'), 'a neighbouring block: lit part only');
  // the edge glow: only a black block's, never in the gap, under the hover frame, constant in CSS pixels
  const body = fs.slice(edge, opaque);
  assert.ok(body.includes('( 1.0 - nsGapCov )') && body.includes('( 1.0 - nsHiCov )'));
  assert.ok(body.includes(`mix( ${ABYSS_EDGE.css}.0, ${ABYSS_EDGE.lookCss}.0, nsHaloSet.y )`), 'wider under the look');
  assert.ok(!body.includes('nsKeyDim') && !body.includes('nsKey.w') && !body.includes('nsClock'), 'it does not react to other areas\' activity or to the clock');
  // nothing of the patch takes a power
  for (const part of [fs.slice(rim, light), fs.slice(halo, opaque)]) assert.ok(!part.includes('pow('));
  // patched twice: refused
  assert.equal(patchAreaHaloShaders(p.vertexShader, p.fragmentShader), null);
  // the lit strength the rim is drawn with is the glow strength: 0 below the glow's onset
  assert.equal(glowIntensity(0.05), 0);
});

test('the shader runs the same falloff, the same skip of a block\'s own halo and the same lit-only rule as the numbers', () => {
  // the shader's three scalar rules are its own text, each once, in this order
  const head = haloFragmentHead();
  for (const t of [HALO_SKIP, HALO_EDGE, HALO_DIST, HALO_FALLOFF]) assert.equal(head.split(t).length - 1, 1, t);
  assert.ok(head.includes(`float nsHaloFall( float d ) { return ${HALO_FALLOFF}; }`));
  assert.ok(head.indexOf(`if ( ${HALO_SKIP} ) continue;`) > 0 && head.indexOf(HALO_SKIP) < head.indexOf(HALO_EDGE) && head.indexOf(HALO_EDGE) < head.indexOf(HALO_DIST));
  assert.ok(head.includes(`float e = ${HALO_EDGE};`) && head.includes(`float d = ${HALO_DIST};`) && head.includes('float f = nsHaloFall( d );') && head.includes('c += cs.rgb * mix( f, wl, litOnly );'));
  // haloAt evaluates that very text; it agrees with the independent pure falloff at every distance
  const b = band(), sh = haloShape(b.pts, b.depth, b.s), H = createHalo();
  const U = { p: new Float32Array(20 * H.slots), c: new Float32Array(4 * H.slots), n: new Float32Array(4) };
  haloSet(H, 'a', sh, 1, 0.5, 0.25, 1, 0, 3); stepHalo(H, 1 / 60); writeHaloUniforms(H, U);
  const mid = sh.p[2], out = [0, 0, 0];
  for (let k = 0; k <= 40; k++) {
    const p = [mid[0] + sh.r + (k / 40) * 1.2 * sh.reach, mid[1], mid[2] + 0.3 * k / 40];
    haloAt(U, p, -1, 0, out);
    assert.ok(Math.abs(out[0] - haloFalloff(sh, p)) < 2e-4, `at ${k}: ${out[0]} against ${haloFalloff(sh, p)}`);
    assert.ok(Math.abs(out[1] - 0.5 * haloFalloff(sh, p)) < 2e-4);
  }
  // a block takes none of its own halo; every other block and the tissue (-1) take it
  haloAt(U, mid, 3, 0, out); assert.deepEqual(out, [0, 0, 0], 'its own block');
  haloAt(U, mid, 4, 0, out); assert.ok(out[0] > 0.99);
  haloAt(U, mid, -1, 0, out); assert.ok(out[0] > 0.99);
  // in the game, the number a block gives its own halo is the number its material skips
  const src = readFileSync(new URL('../scene/src/ns-scene-three.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('hu.set.value.set(regions.length,') && src.includes('index: regions.length, material') && src.includes('hp.lit, hp.look, rec.index)'), 'nsHaloSet.x and the halo\'s own number are the area\'s index');
});

test('a neighbouring block keeps its own colour under a look: it takes only the lit part of a halo', () => {
  const b = band(), sh = haloShape(b.pts, b.depth, b.s), H = createHalo();
  const U = { p: new Float32Array(20 * H.slots), c: new Float32Array(4 * H.slots), n: new Float32Array(4) };
  const at = mm => [sh.p[2][0] + sh.r + mm, sh.p[2][1], sh.p[2][2]], near = at(1), out = [0, 0, 0], S = AREA_HALO.strip;
  const fall = d => (d < 1 ? (1 - d) * (1 - d) : 0);
  // the look alone: the tissue takes the pool; a neighbouring block only a narrow band of it past the block's edge
  haloSet(H, 'neck', sh, 1, 0.4, 0.8, 0, AREA_HALO.look, 2);
  for (let i = 0; i < 60; i++) stepHalo(H, 1 / 60);
  writeHaloUniforms(H, U);
  assert.equal(U.p[11], 0, 'no lit share');
  haloAt(U, near, -1, 0, out); assert.ok(out[0] > 0.6 * AREA_HALO.look, 'the tissue');
  haloAt(U, near, 5, 1, out);
  assert.ok(Math.abs(out[0] - AREA_HALO.look * S.look * fall(1 / S.lookReachMm)) < 1e-5, `a neighbouring block, 1 mm out: ${out[0]}`);
  haloAt(U, at(S.lookReachMm + 0.5), 5, 1, out); assert.deepEqual(out, [0, 0, 0], 'a neighbouring block past the narrow band: its own colour');
  assert.ok(haloAt(U, at(S.lookReachMm + 0.5), -1, 0, [0, 0, 0])[0] > 0.3 * AREA_HALO.look, 'while the tissue there still takes the pool');
  // switched on: the neighbour takes the lit part whole
  haloSet(H, 'neck', sh, 1, 0.4, 0.8, 1, AREA_HALO.look, 2); stepHalo(H, 1 / 60); writeHaloUniforms(H, U);
  assert.equal(U.p[11], 1);
  const t = haloAt(U, near, -1, 0, [0, 0, 0]), n = haloAt(U, near, 5, 1, [0, 0, 0]);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(t[i] - n[i]) < 1e-9);
  // partly lit (the light fading at the end of the contraction, under the look): the lit part at the full reach, the
  // rest of the look's part in the narrow band only
  haloSet(H, 'neck', sh, 1, 0.4, 0.8, 0.3, AREA_HALO.look, 2); stepHalo(H, 1 / 60); writeHaloUniforms(H, U);
  const t2 = haloAt(U, near, -1, 0, [0, 0, 0]), n2 = haloAt(U, near, 5, 1, [0, 0, 0]), f2 = t2[0] / AREA_HALO.look;
  assert.ok(Math.abs(n2[0] - (0.3 * f2 + (AREA_HALO.look - 0.3) * S.look * fall(1 / S.lookReachMm))) < 1e-5);
  const far = at(4), n3 = haloAt(U, far, 5, 1, [0, 0, 0]), t3 = haloAt(U, far, -1, 0, [0, 0, 0]);
  assert.ok(Math.abs(n3[0] - t3[0] * 0.3 / AREA_HALO.look) < 1e-6, 'past the band: the lit part only');
});

test('the pool reads as light in a shadowed fold and stays under display white on a lit crown', () => {
  const gold = areaRecord('lh_hand').glowLinear, fold = [0.05, 0.02, 0.02], crown = [0.92 * 0.76, 0.58 * 0.76, 0.56 * 0.76];
  const f = haloTissueInto(fold.slice(), gold.map(v => v * AREA_HALO.lit));
  const lumF = lum(fold), lumR = lum(f);
  assert.ok(lumR - lumF > 0.1, `a dark fold under the pool gets light (${lumF.toFixed(3)} -> ${lumR.toFixed(3)})`);
  assert.ok(f[0] > f[2] * 4 && f[1] > f[2] * 2, 'in the glow\'s own colour');
  for (const id of Object.keys(AREA_COLORS)) {
    const g = areaRecord(id).glowLinear, c = haloTissueInto(crown.slice(), g);
    assert.ok(Math.max(...c) <= 1, id);
  }
  // the look's pool is a softer version of the same
  const l = haloTissueInto(fold.slice(), gold.map(v => v * AREA_HALO.look));
  assert.ok(lum(l) > lumF && lum(l) < lumR);
  // edge-on, the pool is held back
  const e = haloTissueInto(fold.slice(), gold, 0.05);
  assert.ok(lum(e) < lumR);
});

test('no key press between the lit block and the look\'s glow: a count just after the light ended presses nothing', () => {
  assert.equal(keyPressed(false, true, 0), false);
  assert.equal(keyPressed(true, true, 0), true, 'a click while the area is lit');
  assert.equal(keyPressed(true, false, 0.1), false, 'a look\'s own count, 0.1 s after its 0.4 s of light');
  assert.equal(keyPressed(true, false, 0), false);
  assert.equal(keyPressed(true, false, KEY_PRESS.quietS + 0.01), true, 'a click on an area that has been dark a while');
  assert.equal(keyPressed(true, false, 1e4), true, 'an area never lit');
  assert.equal(keyPressed(true, false, NaN), true);
  assert.ok(KEY_PRESS.quietS > 0.1 && KEY_PRESS.quietS < 0.5, 'longer than the look\'s count comes after its light (0.1 s), shorter than a deliberate second click');
});

test('the old tissue bloom\'s own colour and light give way to the halo; the switch gives them back', () => {
  const B = BRAIN_LIVE.bloom, spillLine = src => (src.match(/nsCol = mix\( nsCol, \( nsLvC[^\n]*/) || [''])[0];
  const on = spillLine(cortexFleshGlsl([0.6, 1.5, 1.8])), off = spillLine(cortexFleshGlsl([0.6, 1.5, 1.8], undefined, undefined, {}, { ...AREA_HALO, on: false }));
  assert.ok(on && off);
  assert.ok(on.includes('), 0.0 * min( nsLvM'), `the bloom's spill of the key's hue is off: ${on}`);
  assert.ok(off.includes(`), ${B.spill} * min( nsLvM`), 'and back with the halo off');
});

// The scene's per-area rule (ns-scene-three updateRegions), driven by the real activity model, one frame at a time.
function sceneRun(id, { hz = 60, frames = null, clickAfterEndS = null, clickAtS = null, phase = 0.5, jitterFromS = null } = {}) {
  const A = createActivity(), H = 1 / hz, r = region(id), scan = isScanArea(r), flares = areaFlares(r, scan);
  let s = A.step(A.state, [], 2.5);
  s = A.step(s, [{ type: 'gaze', kind: 'empty', at: 0 }], H);
  const rec = { puOn: false, puCount: 0, offAt: -1e4, clickAt: -1e4 }, presses = [], glow = [];
  let t = 0, endAt = null, clicked = false;
  for (let i = 0; i < (frames || 4 * hz); i++) {
    const yaw = jitterFromS !== null && t >= jitterFromS ? 0.02 * Math.sin(i) : 0;
    const ev = [{ type: 'gaze', kind: 'region', regionId: id, yaw, pitch: 0, at: 0 }];
    const due = clickAtS !== null ? t + H >= clickAtS : endAt !== null && clickAfterEndS !== null && t + H >= endAt + clickAfterEndS;
    if (due && !clicked) { ev.push({ type: 'click', at: phase * H }); clicked = true; }
    const st = A.stepGated(s, ev, H); s = st.state; t += H;
    const a = shownActivity(A.regionActivity(s)[id], r, scan), n = A.activatedRegions(s)[id] || 0, on = glowIntensity(a) > 0;
    if (on !== rec.puOn) { rec.puOn = on; if (!on) { rec.offAt = t; if (endAt === null) endAt = t; } }
    const c = st.marks.length > 0 && clickedArea(st.marks, id);
    if (c && !flares) rec.clickAt = t;
    if (keyPressed(n > rec.puCount, on, t - rec.offAt, c)) presses.push(+t.toFixed(4));
    rec.puCount = n;
    glow.push(flares ? 0 : clickGlow(t - rec.clickAt));
  }
  return { endAt, presses, glow, H };
}

test('a key is pressed for a click, never for the look\'s own count: by the activity\'s marks, not by time', () => {
  assert.equal(KEY_PRESS.bySource, true);
  assert.equal(keyPressed(true, false, 0.1, true), true, 'a click 0.1 s after the light: pressed (the time rule dropped it)');
  assert.equal(keyPressed(true, true, 0, false), false, 'a look\'s count while lit: not pressed');
  assert.equal(keyPressed(true, false, 1e4, false), false, 'the look\'s count on an area that never lights');
  assert.equal(keyPressed(false, false, 0, true), false);
  assert.equal(keyPressed(true, false, 0.1, null), false, 'no marks handed: the time rule');
  assert.equal(clickedArea([{ source: 'gaze', regionId: 'a' }, { source: 'click', regionId: 'b' }], 'b'), true);
  assert.equal(clickedArea([{ source: 'gaze', regionId: 'a' }], 'a'), false);
  assert.equal(clickedArea(null, 'a'), false);
  // the look alone: the look's own count, half a second in, presses nothing, on a moving area, the tongue, a black block
  for (const id of ['rh_elbow', 'lh_tongue', 'rh_scan_middle']) assert.deepEqual(sceneRun(id).presses, [], id);
  // a click late in its frame (at = dt - 0.002 s), 0.15 s after the light ended: pressed once, at 60 and 144 frames a
  // second (the time rule lost it in 4 of 20 and 11 of 20 frame phases)
  for (const hz of [60, 144]) {
    const run = sceneRun('rh_elbow', { hz, clickAfterEndS: 0.15, phase: 1 - 0.002 * hz });
    assert.ok(run.endAt > 0.3 && run.endAt < 0.6, `the look's light ended at ${run.endAt}`);
    assert.equal(run.presses.length, 1, `${hz} Hz: ${run.presses}`);
    assert.ok(run.presses[0] >= run.endAt + 0.15 - 1.5 * run.H && run.presses[0] <= run.endAt + 0.15 + 1.5 * run.H);
  }
});

test('a click on an area that does not flare gives a soft rise and fall in its own colour for 0.4 s, and only a click', () => {
  assert.ok(CLICK_GLOW.on && CLICK_GLOW.lit > 0.3 && CLICK_GLOW.lit <= 0.6 && CLICK_GLOW.s === 0.4);
  assert.equal(clickGlow(-0.01), 0); assert.equal(clickGlow(0.4), 0); assert.equal(clickGlow(NaN), 0);
  assert.ok(Math.abs(clickGlow(0.2) - CLICK_GLOW.lit) < 1e-9, 'its peak half way');
  assert.ok(clickGlow(0.05) < clickGlow(0.15) && clickGlow(0.35) < clickGlow(0.25), 'it rises and falls');
  assert.equal(clickGlow(0.05, true), CLICK_GLOW.lit, 'steady under reduced motion');
  // it is a lit part of the halo, in the area's colour, never a white core (the area is still drawn with activity 0)
  assert.deepEqual(haloParts({ glow: 0, looked: true, scan: true, click: 0.5 }), { lit: 0.5, look: AREA_HALO.look * ABYSS_EDGE.halo });
  assert.equal(haloParts({ glow: 1, click: 0.5 }).lit, 1, 'a flaring area keeps its own lit part');
  for (const id of ['rh_tongue', 'lh_scan_superior']) {
    // the look alone (and small look movements): no click glow at all
    assert.ok(sceneRun(id, { jitterFromS: 0.8 }).glow.every(g => g === 0), `${id}: a look relights nothing`);
    // a click at 1.2 s: one press, the glow for 0.4 s with its peak about half way, then none, with the look moving
    const run = sceneRun(id, { clickAtS: 1.2, jitterFromS: 1.7 }), H = run.H;
    assert.equal(run.presses.length, 1, `${id}: the click pressed the key`);
    const lit = run.glow.map((g, i) => [g, (i + 1) * H]).filter(([g]) => g > 0);
    assert.ok(lit.length > 0.3 / H && lit.length <= 0.4 / H + 1, `${id}: lit for about 0.4 s (${lit.length} frames)`);
    assert.ok(Math.max(...run.glow) > 0.95 * CLICK_GLOW.lit);
    assert.ok(lit[0][1] >= 1.2 - H && lit[lit.length - 1][1] <= 1.2 + 0.4 + 2 * H, 'only after the click');
  }
  // an area that flares takes no click glow (its own light is the lit part)
  assert.ok(sceneRun('rh_elbow', { clickAtS: 1.2 }).glow.every(g => g === 0));
});
