/**
 * The living brain (ns-brain-live): the beat, the blooms round switched-on areas, the wobble when it is handled.
 *
 * Checks on the pure state and on the shader text. Nothing is drawn here, so these cannot show what the brain looks
 * like; they hold the rules the picture relies on: the beat is the loading picture's, small, and quicker while areas
 * are on; a bloom comes and goes; the tissue lags when the brain is pushed, settles in under a second and is exactly at
 * rest otherwise; nothing moves under reduced motion; every brain shader moves a vertex by the same rule.
 *
 * Run: node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRAIN_LIVE, beatWave, breathWave, createBrainLive, stepBeat, stepBlooms, stepWobble, bloomOn, bloomOff, bloomPulse, bloomCentreOf, writeLiveUniforms, liveMove, beatCentre,
  patchLiveVertex, liveVertexHead, liveBloomGlsl
} from '../scene/src/ns-brain-live.mjs';
import { BRAIN_BEAT, brainBeat, brainBeatClock } from '../scene/src/ns-assembly-core.mjs';
import { cortexFleshGlsl } from '../scene/src/ns-brain-ink.mjs';
import { patchGlassReadShaders } from '../scene/src/ns-scene-three.mjs';

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const K = 0.002; // metres per source mm (any positive number)

test('the game brain beats with the loading picture\'s wave, on the same clock', () => {
  for (let i = 0; i < 400; i++) {
    const t = i * 0.0137;
    assert.ok(Math.abs(beatWave(t) - brainBeat(t).beat) < 1e-12);
    assert.ok(Math.abs(breathWave(t) - brainBeat(t).breath) < 1e-12);
  }
  // the shared clock wraps at a whole number of beats and of breaths, so the wrap is not a jump
  const wrapMs = Math.round(110 * BRAIN_BEAT.beatS * 1000);
  assert.ok(Math.abs(110 * BRAIN_BEAT.beatS - 23 * BRAIN_BEAT.breathS) < 1e-9);
  assert.ok(Math.abs(beatWave(brainBeatClock(wrapMs - 1)) - beatWave(brainBeatClock(wrapMs + 1))) < 0.02);
  assert.ok(Math.abs(breathWave(brainBeatClock(wrapMs - 1)) - breathWave(brainBeatClock(wrapMs + 1))) < 0.01);
  // the first step takes the shared clock: in phase with a loading picture that reads the same clock
  const L = createBrainLive();
  stepBeat(L, 0, 0, 12.3);
  assert.ok(Math.abs(L.beat - brainBeat(12.3).beat) < 1e-12 && Math.abs(L.breath - brainBeat(12.3).breath) < 1e-12);
});

test('the beat is there but faint', () => {
  // 18 November (the check of the first build): at the loading picture's size or less the beat was not noticed in the
  // game (a 3.5 px move of the outline of a 700 px brain). Since the tissue under the crosshair stays put (next test),
  // the swell is now at least the loading picture's, and still a calm one.
  const B = BRAIN_LIVE.beat;
  // 19 November 2026 (the owner: "the beating of the brain is way too obvious. It should be far more subtle"): a faint
  // beat, well under the loading picture's.
  assert.ok(B.swell > 0 && B.swell <= 0.006, 'a faint beat');
  assert.ok(B.breathSwell > 0 && B.breathSwell <= 0.004);
  // a point 75 mm from where the swell grows (the far end of the motor strip from a look at the brain's middle): the
  // whole swing there (beat and breath together) is between 1.2 and 3 mm
  const L = createBrainLive();
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 600; i++) { stepBeat(L, 1 / 60, 0, 0); const m = liveMove(L, [75, 0, 0], [0, 0, 0])[0]; lo = Math.min(lo, m); hi = Math.max(hi, m); }
  assert.ok(hi - lo > 0.2 && hi - lo < 1, `swing ${hi - lo} mm`);
});

test('what is under the crosshair stays under it through the whole beat', () => {
  // The swell grows about the point of the crosshair's line of sight nearest the brain's centre. Any point of that
  // line then moves only ALONG the line, so the tissue seen under the crosshair is the tissue the pick names.
  const centre = [3, -80, 1500], eye = [40, -900, 1700], dir = [-0.02, 0.9, -0.25];
  const c = beatCentre([0, 0, 0], centre, eye, dir);
  const L = createBrainLive();
  for (let i = 0; i < 90; i++) {
    stepBeat(L, 1 / 60, 0, 0);
    for (const t of [700, 760, 820]) {
      const p = [eye[0] + t * dir[0], eye[1] + t * dir[1], eye[2] + t * dir[2]];
      const m = liveMove(L, p, centre, BRAIN_LIVE, c), q = [p[0] + m[0] - eye[0], p[1] + m[1] - eye[1], p[2] + m[2] - eye[2]];
      // the moved point's distance from the line through the eye along dir
      const cx = q[1] * dir[2] - q[2] * dir[1], cy = q[2] * dir[0] - q[0] * dir[2], cz = q[0] * dir[1] - q[1] * dir[0];
      assert.ok(Math.hypot(cx, cy, cz) / Math.hypot(...dir) < 1e-9, 'still on the line of sight');
    }
  }
  // a look that passes far from the brain does not drag the swell with it; a line of no length gives the centre
  const far = beatCentre([0, 0, 0], centre, [900, -900, 1500], [0, 1, 0]);
  assert.ok(Math.abs(Math.hypot(far[0] - centre[0], far[1] - centre[1], far[2] - centre[2]) - BRAIN_LIVE.beat.aimMm) < 1e-9);
  assert.deepEqual(beatCentre([0, 0, 0], centre, eye, [0, 0, 0]), centre);
});

test('the beat picks up a little while areas are on and settles back', () => {
  const L = createBrainLive();
  for (let i = 0; i < 300; i++) stepBeat(L, 1 / 60, 0, 0);
  assert.equal(L.rate, 1);
  for (let i = 0; i < 240; i++) stepBeat(L, 1 / 60, 2, 0);
  assert.ok(L.rate > 1.2 && L.rate <= 1 + 2 * BRAIN_LIVE.rate.perArea + 1e-9, `rate ${L.rate} with two areas on`);
  for (let i = 0; i < 600; i++) stepBeat(L, 1 / 60, 9, 0);
  assert.ok(L.rate <= BRAIN_LIVE.rate.max + 1e-9, 'never a racing pulse');
  for (let i = 0; i < 1200; i++) stepBeat(L, 1 / 60, 0, 0);
  assert.equal(L.rate, 1, 'it settles back');
});

test('a bloom comes when an area goes on, spreads, and fades when it goes off', () => {
  const L = createBrainLive();
  const s = bloomOn(L, 'elbow/right', 10, 20, 30, 0.2, 0.4, 2.0);
  assert.equal(s, 0);
  assert.deepEqual(Array.from(L.slotCol.subarray(0, 3)), [0.1, 0.2, 1], 'the colour is scaled to a brightest channel of 1');
  stepBlooms(L, 1 / 60);
  assert.ok(L.slotS[0] > 0 && L.slotS[0] < 0.2 && L.blooms === 1 && L.on === 1);
  const g0 = L.slotG[0];
  for (let i = 0; i < 120; i++) stepBlooms(L, 1 / 60);
  assert.equal(L.slotS[0], 1);
  assert.ok(L.slotG[0] > g0 + 0.5, 'it spreads while it is on');
  const U = { live: new Float32Array(4), q: new Float32Array(4), a: new Float32Array(4), b: new Float32Array(4 * L.slots), bc: new Float32Array(4 * L.slots) };
  writeLiveUniforms(L, U);
  assert.equal(U.live[3], 1);
  assert.ok(Math.abs(U.b[3] - BRAIN_LIVE.bloom.swellMm) < 1e-6 && Math.abs(U.bc[2] - 1) < 1e-6);
  // the tissue at the bloom's middle is lifted away from the brain's centre by the swell height
  const m = liveMove(L, [10, 20, 30], [0, 0, 0]), len = Math.hypot(...m), dir = Math.hypot(10, 20, 30);
  assert.ok(Math.abs(len - BRAIN_LIVE.bloom.swellMm) < 1e-6 && Math.abs(m[0] / len - 10 / dir) < 1e-9);
  assert.ok(Math.hypot(...liveMove(L, [10, 20, 130], [0, 0, 0])) < 1e-6, 'and not far from it');
  bloomOff(L, 'elbow/right');
  for (let i = 0; i < 60; i++) stepBlooms(L, 1 / 60);
  assert.ok(L.slotS[0] > 0 && L.slotS[0] < 0.4 && L.on === 0, 'fading');
  for (let i = 0; i < 400; i++) stepBlooms(L, 1 / 60);
  assert.equal(L.blooms, 0);
  assert.equal(L.slotId[0], null, 'the slot is free again');
  writeLiveUniforms(L, U);
  assert.equal(U.live[3], 0);
  assert.equal(U.b[3], 0);
});

test('a look makes the tissue give and flush faintly; a movement switched on swells it and sends one ring out', () => {
  const B = BRAIN_LIVE.bloom;
  assert.ok(B.lookLevel > 0.1 && B.lookLevel < 0.5 && B.holdLevel <= B.lookLevel, 'a look (and a held grip) is much fainter than an activation');
  const L = createBrainLive();
  const U = { live: new Float32Array(4), q: new Float32Array(4), a: new Float32Array(4), b: new Float32Array(4 * L.slots), bc: new Float32Array(4 * L.slots), ring: new Float32Array(4), ringc: new Float32Array(4) };
  // looked at: a faint flush and a dimple
  bloomOn(L, 'knee/right', 0, 0, 60, 1, 0.2, 1, B.lookLevel, -B.dipMm);
  for (let i = 0; i < 180; i++) stepBlooms(L, 1 / 60);
  assert.equal(L.slotS[0], B.lookLevel);
  assert.equal(L.slotL[0], -B.dipMm);
  assert.equal(L.bloomMoving, false, 'a settled dimple is still');
  writeLiveUniforms(L, U);
  assert.ok(Math.abs(U.b[3] + B.dipMm) < 1e-6 && Math.abs(U.bc[0] - B.lookLevel) < 1e-6 && U.ring[3] === 0);
  assert.ok(liveMove(L, [0, 0, 60], [0, 0, 0])[2] < -0.9 * B.dipMm, 'the tissue under the look gives (toward the brain\'s middle)');
  assert.equal(bloomPulse(L, 'nobody'), false);
  // the movement is switched on: full bloom, swell, and the ring starts at the key and runs outward, fading
  bloomOn(L, 'knee/right', 0, 0, 60, 1, 0.2, 1, 1, B.swellMm);
  assert.equal(bloomPulse(L, 'knee/right'), true);
  stepBlooms(L, 1 / 60); writeLiveUniforms(L, U);
  assert.ok(L.bloomMoving, 'the swell is rising');
  const r0 = U.ring[3], a0 = U.ringc[0];
  assert.ok(r0 > 0 && a0 > 0.9 && U.ring[2] === 60, 'the ring starts at the bloom\'s centre in its colour');
  for (let i = 0; i < 24; i++) stepBlooms(L, 1 / 60);
  writeLiveUniforms(L, U);
  assert.ok(U.ring[3] > r0 + 10 && U.ringc[0] < a0 && U.ringc[0] > 0, 'it runs outward and fades');
  for (let i = 0; i < 60; i++) stepBlooms(L, 1 / 60);
  writeLiveUniforms(L, U);
  assert.equal(L.ringAge, -1); assert.equal(U.ring[3], 0, 'one ring, then none');
  assert.equal(L.slotS[0], 1); assert.equal(L.slotL[0], B.swellMm);
  assert.ok(liveMove(L, [0, 0, 60], [0, 0, 0])[2] > 0.9 * B.swellMm);
  // off: the swell goes down with the colour and the slot is freed
  bloomOff(L, 'knee/right');
  for (let i = 0; i < 500; i++) stepBlooms(L, 1 / 60);
  assert.equal(L.slotId[0], null); assert.equal(L.bloomMoving, false);
  // no ring under reduced motion
  const M = createBrainLive({ reducedMotion: true });
  bloomOn(M, 'x', 0, 0, 0, 1, 1, 1);
  assert.equal(bloomPulse(M, 'x'), false);
});

test('a bloom sits on the visible face of its key, not in the air beyond it', () => {
  // a key shaped like a gyrus on a brain whose middle is the origin: a crown at radius 70 running along x from -4 to
  // +24, banks going 20 mm down on both sides; its far end (x = 24) rises to radius 82 (a curved strip)
  const p = [];
  for (let x = -4; x <= 24; x += 2) {
    const top = 70 + (x > 14 ? (x - 14) * 1.2 : 0);
    for (let y = -4; y <= 4; y += 2) p.push(x, y, top);
    for (let d = 2; d <= 20; d += 2) { p.push(x, -4, top - d); p.push(x, 4, top - d); }
  }
  const c = bloomCentreOf([0, 0, 0], [Float32Array.from(p)], [0, 0, 0]);
  // on the crown above the middle of the key (within the 5 mm of the line the rule allows), not out at the far end's height
  let nearest = Infinity;
  for (let i = 0; i < p.length; i += 3) nearest = Math.min(nearest, Math.hypot(p[i] - c[0], p[i + 1] - c[1], p[i + 2] - c[2]));
  assert.ok(nearest < 5.1, `the centre is ${nearest} mm from the key's surface`);
  assert.ok(Math.hypot(...c) < 78, 'not lifted to the height of the far end');
  assert.ok(Math.hypot(...c) > 66, 'and not under the surface, down between the banks');
  // an empty area gives the brain's middle; an area that the line misses gives its vertex nearest the line
  assert.deepEqual(bloomCentreOf([0, 0, 0], [], [1, 2, 3]), [1, 2, 3]);
  const ring = [];
  for (let k = 0; k < 12; k++) ring.push(20 * Math.cos(k * Math.PI / 6), 20 * Math.sin(k * Math.PI / 6), 70 + (k === 3 ? 0.5 : 0));
  const rc = bloomCentreOf([0, 0, 0], [ring], [0, 0, 0]);
  assert.ok(Math.abs(Math.hypot(rc[0], rc[1]) - 20) < 1e-6, 'a vertex of the area itself');
});

test('more areas than slots: the strongest are kept, a faint one does not push a strong one out', () => {
  const L = createBrainLive({ slots: 2 });
  bloomOn(L, 'a', 0, 0, 0, 1, 1, 1, 1); bloomOn(L, 'b', 0, 0, 0, 1, 1, 1, 0.5);
  assert.equal(bloomOn(L, 'c', 0, 0, 0, 1, 1, 1, 0.3), -1, 'no room for a fainter one');
  assert.equal(bloomOn(L, 'd', 0, 0, 0, 1, 1, 1, 0.8), 1, 'a stronger one takes the faintest slot');
  assert.deepEqual(L.slotId, ['a', 'd']);
  assert.equal(bloomOn(L, 'a', 1, 2, 3, 1, 1, 1, 0.6), 0, 'the same area keeps its slot');
});

test('the tissue lags when the brain is pushed, settles in under a second, and is exactly at rest otherwise', () => {
  const L = createBrainLive();
  const U = { live: new Float32Array(4), q: new Float32Array(4), a: new Float32Array(4), b: new Float32Array(4 * L.slots), bc: new Float32Array(4 * L.slots) };
  const dt = 1 / 60;
  // at rest: nothing
  for (let i = 0; i < 30; i++) stepWobble(L, dt, [0, 0, -1], I3, K);
  assert.equal(L.wobbling, false);
  assert.deepEqual(Array.from(L.q), [0, 0, 0]);
  // carried to the right at 150 source mm per second for half a second, then stopped
  let x = 0, peakLag = 0;
  for (let i = 0; i < 30; i++) { x += 150 * K * dt; stepWobble(L, dt, [x, 0, -1], I3, K); peakLag = Math.min(peakLag, L.q[0]); }
  assert.ok(L.wobbling && peakLag < -0.5, `the tissue lags behind the hand (${peakLag} mm)`);
  let over = 0, restAt = -1;
  for (let i = 0; i < 120; i++) { stepWobble(L, dt, [x, 0, -1], I3, K); over = Math.max(over, L.q[0]); if (restAt < 0 && Math.abs(L.q[0]) < 0.05 && Math.abs(L.qv[0]) < 1) restAt = i * dt; }
  assert.ok(over > 0.12, `and runs on a little when the brain stops (${over} mm)`);
  assert.ok(over <= BRAIN_LIVE.wobble.maxMm);
  assert.ok(restAt >= 0 && restAt < 0.8, `settled ${restAt} s after the stop`);
  for (let i = 0; i < 120; i++) stepWobble(L, dt, [x, 0, -1], I3, K);
  assert.equal(L.wobbling, false, 'no wobble at rest');
  // a slow, even carry (the W/A/S/D keys: its speed comes and goes gently, so there is no sudden push): the tissue
  // still trails behind all the while, and swings back past its place when the brain comes to rest
  {
    const S = createBrainLive();
    let px = 0, v = 0, trail = 0;
    stepWobble(S, dt, [0, 0, -1], I3, K);
    for (let i = 0; i < 90; i++) { v = Math.min(60, v + 60 * dt / 0.3); px += v * K * dt; stepWobble(S, dt, [px, 0, -1], I3, K); if (i > 45) trail = Math.min(trail, S.q[0]); }
    assert.ok(trail < -0.8 && trail > -BRAIN_LIVE.wobble.dragMm, `the tissue trails a steady carry by ${-trail} mm`);
    assert.ok(S.speedMm > 55 && S.speedMm < 65, 'the speed it saw');
    let past = 0, rest = -1;
    for (let i = 0; i < 120; i++) { v = Math.max(0, v - 60 * dt / 0.15); px += v * K * dt; stepWobble(S, dt, [px, 0, -1], I3, K); past = Math.max(past, S.q[0]); if (rest < 0 && !S.wobbling) rest = i * dt; }
    assert.ok(past > 0.08, `it swings past its place when the carry ends (${past} mm)`);
    assert.ok(rest > 0.15 && rest < 1.2, `and is exactly at rest ${rest} s after the key is let go`);
  }
  // a very quick stop never throws the tissue to its limit in a single frame: it swings there over several
  {
    const S = createBrainLive();
    let px = 0;
    stepWobble(S, dt, [0, 0, -1], I3, K);
    for (let i = 0; i < 12; i++) { px += 800 * K * dt; stepWobble(S, dt, [px, 0, -1], I3, K); }
    const before = S.q[0];
    stepWobble(S, dt, [px, 0, -1], I3, K);
    assert.ok(Math.abs(S.q[0] - before) < 0.45 * BRAIN_LIVE.wobble.maxMm, `one frame after the stop it has moved ${Math.abs(S.q[0] - before)} mm`);
    let peak = -Infinity, at = 0;
    for (let i = 0; i < 40; i++) { stepWobble(S, dt, [px, 0, -1], I3, K); if (S.q[0] > peak) { peak = S.q[0]; at = i + 1; } }
    assert.ok(peak > 0.5 && at >= 3, `it runs on to ${peak} mm ${at} frames after the stop`);
  }
  writeLiveUniforms(L, U);
  assert.equal(U.q[3], 0);
  // the middle follows the hand, the outside lags
  L.q[0] = 2; L.wobbling = true;
  assert.equal(liveMove(L, [0, 0, 0], [0, 0, 0])[0], 0);
  assert.equal(liveMove(L, [0, 0, BRAIN_LIVE.wobble.radiusMm], [0, 0, 0])[0], 2);
  assert.equal(liveMove(L, [0, 0, 3 * BRAIN_LIVE.wobble.radiusMm], [0, 0, 0])[0], 2);
});

test('turning the brain makes the tissue lag in turn too; a jump of the view is not a push', () => {
  const L = createBrainLive();
  const dt = 1 / 60, rotZ = a => [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1];
  stepWobble(L, dt, [0, 0, -1], rotZ(0), K);
  let a = 0, lag = 0;
  for (let i = 0; i < 20; i++) { a += 1.5 * dt; stepWobble(L, dt, [0, 0, -1], rotZ(a), K); lag = Math.min(lag, L.a[2]); }
  assert.ok(L.wobbling && lag < -0.005 && Math.abs(L.a[0]) < 1e-9 && Math.abs(L.a[1]) < 1e-9, `turn lag ${lag} rad about the turned axis`);
  assert.ok(Math.hypot(...L.a) <= BRAIN_LIVE.wobble.maxRad + 1e-12);
  // a slow, even turn (an arrow held): the tissue trails it all the while, then swings back and rests
  {
    const S = createBrainLive();
    let b = 0, trail = 0;
    stepWobble(S, dt, [0, 0, -1], rotZ(0), K);
    for (let i = 0; i < 60; i++) { b += 0.7 * dt; stepWobble(S, dt, [0, 0, -1], rotZ(b), K); if (i > 30) trail = Math.min(trail, S.a[2]); }
    assert.ok(trail < -0.012, `turn lag ${trail} rad while an arrow turns the brain (${-trail * BRAIN_LIVE.wobble.radiusMm} mm at the rim)`);
    let past = 0;
    for (let i = 0; i < 120; i++) { stepWobble(S, dt, [0, 0, -1], rotZ(b), K); past = Math.max(past, S.a[2]); }
    assert.ok(past > 0.0008 && S.wobbling === false, 'it swings past a little and comes to rest');
  }
  // an arrow places the brain in steps (a turn only every third frame): the tissue trails it as it does an even turn
  {
    const S = createBrainLive();
    let b = 0, trail = 0;
    stepWobble(S, dt, [0, 0, -1], rotZ(0), K);
    for (let i = 0; i < 45; i++) { if (i % 3 === 0) b += 1.17 * dt; stepWobble(S, dt, [0, 0, -1], rotZ(b), K); if (i > 24) trail = Math.min(trail, S.a[2]); }
    assert.ok(trail < -0.02, `turn lag ${trail} rad under an arrow (${-trail * BRAIN_LIVE.wobble.radiusMm} mm at the rim)`);
  }
  const M = createBrainLive();
  stepWobble(M, dt, [0, 0, -1], I3, K);
  stepWobble(M, dt, [5, 0, -1], I3, K); // five metres in one frame: a new view, not a carry
  assert.equal(M.wobbling, false);
  stepWobble(M, 3, [5.1, 0, -1], I3, K); // a long pause is not a push either
  assert.equal(M.wobbling, false);
});

test('under reduced motion nothing moves; an area that is on shows at once and steadily', () => {
  const L = createBrainLive({ reducedMotion: true });
  const U = { live: new Float32Array(4), q: new Float32Array(4), a: new Float32Array(4), b: new Float32Array(4 * L.slots), bc: new Float32Array(4 * L.slots) };
  bloomOn(L, 'x', 10, 0, 0, 1, 0, 0);
  let x = 0;
  for (let i = 0; i < 60; i++) { x += 0.01; stepBlooms(L, 1 / 60); stepBeat(L, 1 / 60, L.on, 5); stepWobble(L, 1 / 60, [x, 0, -1], I3, K); }
  assert.equal(L.swell, 0); assert.equal(L.beat, 0); assert.equal(L.wobbling, false);
  assert.equal(L.slotS[0], 1, 'the bloom is fully on at once');
  writeLiveUniforms(L, U);
  assert.equal(U.live[0], 0); assert.equal(U.q[3], 0);
  assert.equal(U.b[3], 0, 'no swell');
  assert.equal(U.live[3], 1); assert.equal(U.bc[0], 1, 'but its colour is there');
  assert.deepEqual(liveMove(L, [50, 20, 10], [0, 0, 0]), [0, 0, 0]);
  bloomOff(L, 'x'); stepBlooms(L, 1 / 60);
  assert.equal(L.blooms, 0, 'and off at once');
});

test('every brain shader moves a vertex by the same rule of its rest position', () => {
  const vs = 'void main() {\n#include <begin_vertex>\n#include <project_vertex>\n}';
  const p = patchLiveVertex(vs);
  assert.ok(p.includes('transformed += nsLiveMove( position );'));
  assert.ok(p.startsWith(liveVertexHead()), 'one head for all');
  assert.ok(p.includes('invariant gl_Position;'), 'the depth pre-pass and the colour pass must agree to the last bit');
  assert.equal(patchLiveVertex(p), null, 'never twice');
  assert.equal(patchLiveVertex('void main() {}'), null);
  // a small rigid thing that sits on the brain (a marker) moves whole, as the tissue under its centre moves
  const m = patchLiveVertex(vs, undefined, { rigidAt: true });
  assert.ok(m.includes('uniform vec4 nsLiveAt;') && m.includes('transformed += nsLiveMove( nsLiveAt.xyz ) * nsLiveAt.w;') && m.includes(liveVertexHead()));
  // the surface's colour reads the same blooms
  const flesh = cortexFleshGlsl([0.6, 1.5, 1.8]);
  assert.ok(flesh.includes(liveBloomGlsl('vNsObj')) && flesh.includes('nsLive.y'));
  // the bloom keeps the tissue's own light and shade (its brightness x the key's colour), is held back where the
  // surface is seen edge-on, and never replaces the tissue with a flat colour
  assert.ok(flesh.includes('nsLvY') && flesh.includes('nsLvZ') && !flesh.includes('undefined'));
  assert.ok(BRAIN_LIVE.bloom.spill <= 0.5 && BRAIN_LIVE.bloom.glow <= 0.2);
  const shell = patchGlassReadShaders('void main() {\n#include <begin_vertex>\n#include <project_vertex>\n}', 'void main() {\nvec3 outgoingLight = vec3( 0.0 );\n#include <opaque_fragment>\n}');
  assert.ok(shell.fragmentShader.includes('uniform vec4 nsLiveBc[ ' + BRAIN_LIVE.bloom.slots + ' ];'));
  assert.ok(shell.vertexShader.includes('#ifdef NS_LIVE_TILT'));
});
