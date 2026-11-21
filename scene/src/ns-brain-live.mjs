/** NeuroSurge scene: the LIVING brain (owner, 17 November 2026: "Perhaps let's also get a beating reacting brain as you
 * would see in neurosurgery."; "neural activation should be much more obvious on the motor strip").
 *
 * What the player sees:
 *  - IT BEATS. The brain swells a little with each heartbeat (a quick rise, a slower fall with a small second bump) on
 *    a slow rise and fall like breathing: the same wave, rate and clock as the brain of the loading picture
 *    (ns-assembly-core brainBeat, brainBeatClock), so the brain that came together there goes on beating here. The wet
 *    highlights slide over the folds with it and the tissue flushes very slightly at each beat.
 *  - IT REACTS TO THE LOOK AND TO ACTIVITY. The tissue round the key under the crosshair gives a little (a shallow
 *    dimple) and flushes faintly. When a movement is switched on (a number key, a click, a look that has rested), the
 *    tissue round its key swells, flushes rosy with a hint of the key's colour (a "bloom": the tissue keeps its folds
 *    and its own light) and ONE ring of the key's colour runs outward from the key over the tissue; the bloom fades
 *    when the area goes off. The beat picks up a little with every area that is on, then settles back. The grip of a
 *    Space grasp is not a movement switched on from the brain: its hand area shows only a faint flush while it holds.
 *  - IT REACTS TO BEING HANDLED. While the brain is carried or turned (pointer, W/A/S/D, press-and-drag, the arrows)
 *    the soft tissue trails behind; when it starts or stops the tissue swings and settles in about half a second,
 *    like firm jelly: the middle follows the hand, the outside lags. Nothing moves at rest.
 *
 * How it is drawn. The brain GROUP is never moved or scaled for this (its picking, labels, arrows and contact spheres
 * all assume the rest shape). Instead every brain material displaces its vertices with ONE function of the vertex's
 * rest position (source mm) and a few shared uniforms (LIVE_VERTEX_HEAD: nsLiveMove), so the surface, the motor
 * areas, their depth pre-passes and the strip's silhouette all move together and nothing separates. Per frame the
 * scene writes those uniforms and nothing else (no allocation, no new pass).
 *
 * Under prefers-reduced-motion nothing moves (no beat, no wobble, no swell): an area that is on shows its flush and
 * light as a steady colour, switched on and off at once.
 *
 * Pure: numbers, typed arrays and shader strings; nothing imports 'three'. Everything here is a display rhythm for a
 * simulated teaching picture: no pulse, pressure, blood flow or tissue mechanics is measured or implied.
 */
import { BRAIN_BEAT } from './ns-assembly-core.mjs';

/** Display choices.
 *  beat: swell / breathSwell: the share by which the brain grows at the top of a beat / of a breath (the outline of a
 *    brain 700 px across moves about 6 px with the beat and 3 px either way with the breath; a little more than the
 *    loading picture's brain, which is drawn smaller). It grows about the point
 *    of the LINE OF SIGHT THROUGH THE CROSSHAIR that is nearest the brain's centre (beatCentre), not about the centre
 *    itself: a scale about a point of that line keeps every point of the line on it, so the tissue under the crosshair
 *    stays under the crosshair through the whole beat and the area named by the tip is the area seen there. aimMm:
 *    that point is kept within this distance of the brain's centre (a look that passes the brain far away does not
 *    drag the swell with it); slide / breathSlide: how far the wet highlights' light leans at the top
 *    of a beat / breath (a share of the light direction; the highlights slide a millimetre or two over the folds);
 *    flush: how much redder the tissue is at the top of a beat.
 *  rate: the beat is perArea faster for every area that is switched on, at most `max` times the resting rate; it
 *    picks up over upS and settles back over downS (time constants, seconds).
 *  bloom: slots: how many blooms are drawn at once (one per hemisphere of an area that is on); swellMm: the height of
 *    the local swell round a movement that is switched on; dipMm: how far the tissue round the key under the crosshair
 *    gives (a dimple, before anything is switched on); lookLevel: the strength of the bloom of an area that is only
 *    looked at (or that the look crossed) against 1 for a movement switched on; holdLevel: the same for the hand area
 *    of a Space grip while it holds; radiusMm: how far a bloom reaches once it has spread (it starts at radius0 of that
 *    and spreads over growS); inS / outS: how fast its strength comes and goes; flush: how far the tissue's colour
 *    moves to flushTint (a multiplier of the tissue colour, so the folds stay) at its centre; spill: how far the
 *    tissue's HUE moves to the key's colour at the bloom's middle while its own light and shade are kept (the lit
 *    tissue's brightness x the key's colour x spillGain: the folds, the vessels and the wet light stay, so it reads
 *    as flushed tissue and never as a pale wash); glow: light of the key's colour ABOVE display white right next to
 *    the key (the scene's bloom gives it a soft halo; the only tissue light that may bloom); grazeLo / grazeHi /
 *    grazeKeep: where the surface is seen edge-on (its facing under grazeLo .. grazeHi) the key's colour keeps only
 *    grazeKeep of its strength and the glow none (edge-on it smeared into a long pale stain); ring: while the bloom
 *    spreads, its edge is a soft ring of the key's colour (ringAt x the radius out, ringW x the radius wide) that
 *    fades as it arrives; tilt: how much the swell or the dimple leans the surface for the light (x the true slope:
 *    a display exaggeration, they are seen mostly through their shading).
 *    The ring of a movement being switched on: pulseS: how long it runs; pulseFrom / pulseTo: its radius at the start
 *    and at the end (x radiusMm); pulseW: its width (x radiusMm, widening as it runs); pulse: how far the tissue's hue
 *    moves to the key's colour on the ring; pulseGlow: its light above white (it fades as it runs).
 *  wobble: hz / zeta: the tissue's own swing and its damping (it settles to a few percent in about half a second);
 *    smoothS: the brain's speed is felt smoothed over this time (its placement often changes in steps);
 *    dragS: while the brain MOVES the tissue trails behind by this many seconds of the brain's speed (of at most
 *    dragSpeedMm of it, smoothed over dragSmoothS), softly limited to dragMm
 *    (a soft limit; the W/A/S/D keys carry the brain at only about 10 mm a second, so the time is long), so a steady
 *    carry by the keys shows too, and letting go of it lets the tissue swing back and settle; gain: how much of a sudden change of the brain's speed the tissue takes on
 *    top of that (a stop against something); maxMm: the most the outside of the brain is ever off; speedMm: speeds
 *    above this are not felt (a jump of the view is not a push); turnDragS / dragRad / dragSpeedRad / turnGain /
 *    maxRad / speedRad: the same for turning; radiusMm: the tissue at this distance from the centre (and farther) lags fully, the centre
 *    not at all; restMm / restRad: below this it is at rest (nothing is written or drawn differently). */
export const BRAIN_LIVE = Object.freeze({
  // 19 November 2026 (the owner: "the beating of the brain is way too obvious. It should be far more subtle"): about a
  // third of the earlier swell, slide and flush (0.017, 0.008, 0.24, 0.12, 0.07).
  // 19 November 2026, later (the owner: "let's make blood flow and brain beating far less noticeable. But there, if you
  // really, really pay attention"): about a third again (0.005, 0.003, 0.08, 0.04, 0.022 that morning).
  beat: Object.freeze({ swell: 0.0018, breathSwell: 0.0012, aimMm: 130, slide: 0.03, breathSlide: 0.015, flush: 0.007 }),
  rate: Object.freeze({ perArea: 0.14, max: 1.45, upS: 0.9, downS: 3.0 }),
  bloom: Object.freeze({ slots: 6, swellMm: 1.6, dipMm: 0.8, lookLevel: 0.35, holdLevel: 0.2, radiusMm: 17, radius0: 0.4, growS: 0.6, inS: 0.16, outS: 0.8,
    flush: 0.6, flushTint: Object.freeze([1.22, 0.7, 0.74]), spill: 0.4, spillGain: 1.3, glow: 0.12, grazeLo: 0.12, grazeHi: 0.45, grazeKeep: 0.35,
    ring: 0.5, ringAt: 1.2, ringW: 0.28, tilt: 2.5,
    // 21 November 2026 (ns-area-halo; the owner: "there's essentially no glow, and it's too much before as well"): the
    // ring of a movement being switched on now has the area's own colour (it took the area's emission, near white
    // while lit), and in that colour the old ring was a wide wave over 41 mm of cortex that ran on for 0.4 s after the
    // contraction had ended. It ends with the contraction (pulseS 0.8 -> 0.45; at 0.4 s it is at 4 % of its strength:
    // nothing is lit on the way back), runs half as far (pulseTo 2.4 -> 1.3, 22 mm), takes a third of the tissue's
    // colour (pulse 0.75 -> 0.25; at 0.4 it was still a pale-blue band right across the cortex beside a lit elbow area)
    // and carries no light above white (pulseGlow 0.3 -> 0: that showed only where the bloom pass runs).
    pulseS: 0.45, pulseFrom: 0.3, pulseTo: 1.3, pulseW: 0.2, pulse: 0.25, pulseGlow: 0 }),
  wobble: Object.freeze({ hz: 3.0, zeta: 0.36, smoothS: 0.05, gain: 0.4, maxMm: 4.2, speedMm: 900,
    dragS: 0.14, dragMm: 3, dragSpeedMm: 25, dragSmoothS: 0.07,
    turnGain: 0.4, maxRad: 0.05, speedRad: 6, turnDragS: 0.1, dragRad: 0.035, dragSpeedRad: 1.25,
    radiusMm: 80, restMm: 0.01, restRad: 0.0002 })
});

/** One beat of the loading picture's wave at beat time t (seconds), 0..1: the same numbers as ns-assembly-core
 * brainBeat(t).beat, without an object per call. Pure. */
export function beatWave(t, beatS = BRAIN_BEAT.beatS) {
  const ph = ((t % beatS) + beatS) % beatS / beatS;
  const rise = ph < 0.14 ? Math.sin((Math.PI / 2) * (ph / 0.14)) ** 2 : Math.exp(-(ph - 0.14) / 0.2);
  return Math.min(1, rise + 0.14 * Math.exp(-(((ph - 0.42) / 0.06) ** 2)));
}
/** The slow breathing wave at time t (seconds), -1..1 (ns-assembly-core brainBeat(t).breath). Pure. */
export function breathWave(t, breathS = BRAIN_BEAT.breathS) { return Math.sin((2 * Math.PI * t) / breathS); }

/** A living brain's state (plain numbers and typed arrays; stepped in place, nothing is allocated after this).
 *  t / tb: the beat's and the breath's own clocks (seconds; null until the first step takes the shared clock);
 *  rate: the beat's rate (1 at rest); beat / breath / swell: this frame's waves and the share the brain has grown;
 *  q / a: the tissue's lag (source mm) and turn lag (radians) in the brain's own axes, qv / av their rates;
 *  wobbling: whether q or a is not at rest; speedMm / turnRadS: the brain's speed and turning as the wobble last saw
 *  them; slot*: the blooms (id, the level 0..1 it goes to, strength 0..1, spread 0..1, age, centre xyz source mm,
 *  colour rgb, slotLt / slotL: the height in mm its local swell goes to / has now: above 0 a swell, below 0 a
 *  dimple); blooms: how many slots have any strength; on: the sum of the levels (how many areas are on, counting a
 *  faintly lit one for less); ringAge: seconds since the ring of the last movement switched on started (-1: none),
 *  ringC / ringCol its centre and colour. */
export function createBrainLive({ reducedMotion = false, slots = BRAIN_LIVE.bloom.slots } = {}) {
  return {
    kind: 'ns-brain-live', reducedMotion: reducedMotion === true, slots,
    t: null, tb: null, rate: 1, beat: 0, breath: 0, swell: 0,
    q: new Float64Array(3), qv: new Float64Array(3), a: new Float64Array(3), av: new Float64Array(3), wobbling: false, speedMm: 0, turnRadS: 0,
    has: false, c0: new Float64Array(3), r0: new Float64Array(9), v0: new Float64Array(3), w0: new Float64Array(3), d0: new Float64Array(3), e0: new Float64Array(3),
    slotId: new Array(slots).fill(null), slotT: new Float64Array(slots), slotS: new Float64Array(slots), slotG: new Float64Array(slots),
    slotAge: new Float64Array(slots), slotC: new Float64Array(3 * slots), slotCol: new Float64Array(3 * slots), slotLt: new Float64Array(slots), slotL: new Float64Array(slots),
    blooms: 0, on: 0, bloomMoving: false, ringAge: -1, ringC: new Float64Array(3), ringCol: new Float64Array(3)
  };
}

/** Step the beat: dtS seconds on, with `active` areas switched on; clockS is the shared beat clock (ns-assembly-core
 * brainBeatClock), taken once, at the first step, so the game's brain is in phase with the loading picture's.
 * Under reduced motion nothing beats. Returns the state. */
export function stepBeat(L, dtS, active = 0, clockS = 0, o = BRAIN_LIVE) {
  if (L.reducedMotion) { L.beat = 0; L.breath = 0; L.swell = 0; L.rate = 1; return L; }
  const dt = dtS > 0 ? Math.min(dtS, 0.25) : 0;
  if (L.t === null) { L.t = Number.isFinite(clockS) ? clockS : 0; L.tb = L.t; }
  const target = Math.min(o.rate.max, 1 + o.rate.perArea * Math.max(0, active));
  const tau = target > L.rate ? o.rate.upS : o.rate.downS;
  L.rate += (target - L.rate) * (dt > 0 ? 1 - Math.exp(-dt / tau) : 0);
  if (Math.abs(target - L.rate) < 1e-3) L.rate = target;
  // both clocks wrap at a whole number of beats and of breaths (110 beats = 23 breaths), so they stay exact for hours
  const wrap = 110 * BRAIN_BEAT.beatS;
  L.t = (L.t + dt * L.rate) % wrap;
  L.tb = (L.tb + dt * (1 + 0.5 * (L.rate - 1))) % (23 * BRAIN_BEAT.breathS);
  L.beat = beatWave(L.t);
  L.breath = breathWave(L.tb);
  L.swell = o.beat.swell * L.beat + o.beat.breathSwell * L.breath;
  return L;
}

/** Switch a bloom on for `id` (an area's hemisphere) at centre (x, y, z; source mm) in colour (r, g, b; linear, any
 * strength: it is scaled so its brightest channel is 1), toward `level` (0..1: how strongly the area is lit). liftMm:
 * the height its local swell goes to (above 0 a swell: a movement switched on; below 0 a dimple: the tissue gives
 * under the look; 0 none). The slot of the same id is reused; else a free slot; else the weakest slot that is fading
 * out; else the weakest of all when this one is to be stronger (else it is not shown: -1). Returns the slot. */
export function bloomOn(L, id, x, y, z, r, g, b, level = 1, liftMm = BRAIN_LIVE.bloom.swellMm * Math.min(1, Math.max(0, level))) {
  const lv = Math.min(1, Math.max(0, level));
  let s = L.slotId.indexOf(id);
  if (s < 0) s = L.slotId.indexOf(null);
  if (s < 0) { let best = Infinity; for (let i = 0; i < L.slots; i++) if (!(L.slotT[i] > 0) && L.slotS[i] < best) { best = L.slotS[i]; s = i; } }
  if (s < 0) { let low = lv; for (let i = 0; i < L.slots; i++) if (L.slotT[i] < low) { low = L.slotT[i]; s = i; } }
  if (s < 0) return -1;
  if (L.slotId[s] !== id) { L.slotS[s] = 0; L.slotG[s] = 0; L.slotAge[s] = 0; L.slotL[s] = 0; }
  L.slotId[s] = id; L.slotT[s] = lv; L.slotLt[s] = Number.isFinite(liftMm) ? liftMm : 0;
  L.slotC[3 * s] = x; L.slotC[3 * s + 1] = y; L.slotC[3 * s + 2] = z;
  const m = Math.max(r, g, b);
  if (m > 1e-6) { L.slotCol[3 * s] = r / m; L.slotCol[3 * s + 1] = g / m; L.slotCol[3 * s + 2] = b / m; }
  else { L.slotCol[3 * s] = 1; L.slotCol[3 * s + 1] = 0.8; L.slotCol[3 * s + 2] = 0.8; }
  return s;
}
/** The bloom of `id` starts to fade. Returns whether there was one. */
export function bloomOff(L, id) { const s = L.slotId.indexOf(id); if (s < 0) return false; L.slotT[s] = 0; L.slotLt[s] = 0; return true; }
/** A movement of `id` is switched on NOW: one ring of its colour starts at its bloom's centre and runs outward
 * (BRAIN_LIVE.bloom pulse*). One ring at a time: a newer one replaces it. Not under reduced motion. Returns whether
 * a ring started (the area must have a bloom). */
export function bloomPulse(L, id) {
  const s = L.slotId.indexOf(id);
  if (s < 0 || L.reducedMotion) return false;
  for (let i = 0; i < 3; i++) { L.ringC[i] = L.slotC[3 * s + i]; L.ringCol[i] = L.slotCol[3 * s + i]; }
  L.ringAge = 0;
  return true;
}

/** Step the blooms: each strength eases to its level while on and to 0 when off (at once under reduced motion), its
 * swell or dimple to its height; a bloom spreads while it is on; a faded bloom frees its slot; the ring runs out.
 * Sets L.blooms (slots with any strength), L.on (the sum of the levels) and L.bloomMoving (whether any bloom's swell
 * is still changing shape: a bloom that is fully out, or that only changes colour, is still). */
export function stepBlooms(L, dtS, o = BRAIN_LIVE) {
  const dt = dtS > 0 ? Math.min(dtS, 0.25) : 0, B = o.bloom;
  let n = 0, on = 0, moving = false;
  for (let i = 0; i < L.slots; i++) {
    if (L.slotId[i] === null) continue;
    const target = L.slotT[i];
    if (L.reducedMotion) { L.slotS[i] = target; L.slotG[i] = 1; L.slotL[i] = 0; }
    else {
      const alive = target > 0 || L.slotLt[i] !== 0, lift = L.slotLt[i]; // a dimple needs no colour
      L.slotS[i] += (target - L.slotS[i]) * (dt > 0 ? 1 - Math.exp(-dt / (target > L.slotS[i] ? B.inS : B.outS)) : 0);
      if (Math.abs(target - L.slotS[i]) < 0.004) L.slotS[i] = target;
      L.slotL[i] += (lift - L.slotL[i]) * (dt > 0 ? 1 - Math.exp(-dt / (alive ? B.inS : B.outS)) : 0);
      if (Math.abs(lift - L.slotL[i]) < 0.006) L.slotL[i] = lift;
      if (alive) { L.slotG[i] += (1 - L.slotG[i]) * (dt > 0 ? 1 - Math.exp(-dt / B.growS) : 0); if (L.slotG[i] > 0.97) L.slotG[i] = 1; }
      if (L.slotL[i] !== lift || (L.slotL[i] !== 0 && alive && L.slotG[i] !== 1)) moving = true;
    }
    L.slotAge[i] += dt;
    if (!(target > 0) && L.slotLt[i] === 0 && L.slotS[i] === 0 && L.slotL[i] === 0) { L.slotId[i] = null; L.slotG[i] = 0; continue; }
    n++; on += target;
  }
  L.blooms = n; L.on = on; L.bloomMoving = moving;
  if (L.ringAge >= 0) { L.ringAge += dt; if (L.reducedMotion || L.ringAge >= B.pulseS) L.ringAge = -1; }
  return L;
}

/** Step the wobble. C: where the brain's centre is in the world (metres); R: its rotation (3x3, column-major: world
 * from the brain's own axes); k: metres per source mm. While the brain moves or turns, the tissue is drawn behind it
 * (dragS x its speed, softly limited to dragMm; the same for turning), and it takes a share of every sudden CHANGE of
 * the brain's speed and of its turning the other way; it swings on a damped spring toward where it belongs (it trails
 * while the brain is carried, runs on when the brain stops, and comes to rest). A long frame, a first frame or a jump
 * faster than speedMm is not a push. Under reduced motion the tissue never leaves rest. Returns the state. */
export function stepWobble(L, dtS, C, R, k, o = BRAIN_LIVE) {
  const W = o.wobble, q = L.q, qv = L.qv, a = L.a, av = L.av;
  const ok = C && R && k > 0 && Number.isFinite(C[0] + C[1] + C[2]);
  if (L.reducedMotion || !ok) { q.fill(0); qv.fill(0); a.fill(0); av.fill(0); L.wobbling = false; L.has = false; L.speedMm = 0; L.turnRadS = 0; return L; }
  const fresh = !L.has || !(dtS > 0) || dtS > 0.2;
  const w0 = 2 * Math.PI * W.hz;
  let tx = 0, ty = 0, tz = 0, ux = 0, uy = 0, uz = 0; // where the tissue belongs now: behind the moving, turning brain
  L.speedMm = 0; L.turnRadS = 0;
  if (!fresh) {
    // the brain's speed (source mm per second, world axes) and its turning (radians per second, world axes)
    const vx = (C[0] - L.c0[0]) / dtS / k, vy = (C[1] - L.c0[1]) / dtS / k, vz = (C[2] - L.c0[2]) / dtS / k;
    const p = L.r0;
    // dR = R x R0^T; its antisymmetric part is the small turn of this frame
    const d21 = R[2] * p[1] + R[5] * p[4] + R[8] * p[7], d12 = R[1] * p[2] + R[4] * p[5] + R[7] * p[8];
    const d02 = R[0] * p[2] + R[3] * p[5] + R[6] * p[8], d20 = R[2] * p[0] + R[5] * p[3] + R[8] * p[6];
    const d10 = R[1] * p[0] + R[4] * p[3] + R[7] * p[6], d01 = R[0] * p[1] + R[3] * p[4] + R[6] * p[7];
    const wx = 0.5 * (d21 - d12) / dtS, wy = 0.5 * (d02 - d20) / dtS, wz = 0.5 * (d10 - d01) / dtS;
    const speed = Math.hypot(vx, vy, vz), turn = Math.hypot(wx, wy, wz);
    if (speed > W.speedMm || turn > W.speedRad) { L.v0.fill(0); L.w0.fill(0); L.d0.fill(0); L.e0.fill(0); }
    else {
      // The brain is often placed in steps (a turn by an arrow changes its placement only every few frames: a raw
      // frame-to-frame speed of 0, 0, v, 0, 0, v), so the tissue feels the speed smoothed over a few frames.
      // 1. Sudden changes (smoothed over smoothS): a share of every change, into the brain's own axes (R^T), against it.
      const m = 1 - Math.exp(-dtS / W.smoothS);
      let sx = L.v0[0] + (vx - L.v0[0]) * m, sy = L.v0[1] + (vy - L.v0[1]) * m, sz = L.v0[2] + (vz - L.v0[2]) * m;
      let rx = L.w0[0] + (wx - L.w0[0]) * m, ry = L.w0[1] + (wy - L.w0[1]) * m, rz = L.w0[2] + (wz - L.w0[2]) * m;
      if (speed === 0 && Math.hypot(sx, sy, sz) < W.restMm * w0) { sx = 0; sy = 0; sz = 0; } // the brain is still: so is what the tissue feels
      if (turn === 0 && Math.hypot(rx, ry, rz) < W.restRad * w0) { rx = 0; ry = 0; rz = 0; }
      const dx = sx - L.v0[0], dy = sy - L.v0[1], dz = sz - L.v0[2], ex = rx - L.w0[0], ey = ry - L.w0[1], ez = rz - L.w0[2];
      qv[0] -= W.gain * (R[0] * dx + R[1] * dy + R[2] * dz); qv[1] -= W.gain * (R[3] * dx + R[4] * dy + R[5] * dz); qv[2] -= W.gain * (R[6] * dx + R[7] * dy + R[8] * dz);
      av[0] -= W.turnGain * (R[0] * ex + R[1] * ey + R[2] * ez); av[1] -= W.turnGain * (R[3] * ex + R[4] * ey + R[5] * ez); av[2] -= W.turnGain * (R[6] * ex + R[7] * ey + R[8] * ez);
      L.v0[0] = sx; L.v0[1] = sy; L.v0[2] = sz; L.w0[0] = rx; L.w0[1] = ry; L.w0[2] = rz;
      L.speedMm = Math.hypot(sx, sy, sz); L.turnRadS = Math.hypot(rx, ry, rz);
      // 2. The trail behind a moving brain: from the speed held to dragSpeedMm BEFORE it is smoothed (over dragSmoothS),
      // so a quick carry trails no longer than a slow one once it stops (a smoothed quick speed would hold the tissue
      // back for a quarter of a second after the brain has stopped).
      const n = 1 - Math.exp(-dtS / W.dragSmoothS), cv = speed > W.dragSpeedMm ? W.dragSpeedMm / speed : 1, cw = turn > W.dragSpeedRad ? W.dragSpeedRad / turn : 1;
      let gx = L.d0[0] + (vx * cv - L.d0[0]) * n, gy = L.d0[1] + (vy * cv - L.d0[1]) * n, gz = L.d0[2] + (vz * cv - L.d0[2]) * n;
      let hx = L.e0[0] + (wx * cw - L.e0[0]) * n, hy = L.e0[1] + (wy * cw - L.e0[1]) * n, hz = L.e0[2] + (wz * cw - L.e0[2]) * n;
      let gs = Math.hypot(gx, gy, gz), hs = Math.hypot(hx, hy, hz);
      if (speed === 0 && gs < W.restMm * w0) { gx = 0; gy = 0; gz = 0; gs = 0; }
      if (turn === 0 && hs < W.restRad * w0) { hx = 0; hy = 0; hz = 0; hs = 0; }
      L.d0[0] = gx; L.d0[1] = gy; L.d0[2] = gz; L.e0[0] = hx; L.e0[1] = hy; L.e0[2] = hz;
      if (gs > 0) { const f = -W.dragMm * Math.tanh(W.dragS * gs / W.dragMm) / gs; tx = f * (R[0] * gx + R[1] * gy + R[2] * gz); ty = f * (R[3] * gx + R[4] * gy + R[5] * gz); tz = f * (R[6] * gx + R[7] * gy + R[8] * gz); }
      if (hs > 0) { const f = -W.dragRad * Math.tanh(W.turnDragS * hs / W.dragRad) / hs; ux = f * (R[0] * hx + R[1] * hy + R[2] * hz); uy = f * (R[3] * hx + R[4] * hy + R[5] * hz); uz = f * (R[6] * hx + R[7] * hy + R[8] * hz); }
      // a sudden change of speed never throws the tissue to its limit in one frame: it swings there
      const qs = Math.hypot(qv[0], qv[1], qv[2]), as = Math.hypot(av[0], av[1], av[2]);
      if (qs > W.maxMm * w0) { const f = W.maxMm * w0 / qs; qv[0] *= f; qv[1] *= f; qv[2] *= f; }
      if (as > W.maxRad * w0) { const f = W.maxRad * w0 / as; av[0] *= f; av[1] *= f; av[2] *= f; }
    }
  } else { L.v0.fill(0); L.w0.fill(0); L.d0.fill(0); L.e0.fill(0); }
  L.has = true;
  L.c0[0] = C[0]; L.c0[1] = C[1]; L.c0[2] = C[2];
  for (let i = 0; i < 9; i++) L.r0[i] = R[i];
  const dt = dtS > 0 ? Math.min(dtS, 0.1) : 0;
  if (dt > 0) {
    const kk = w0 * w0, cc = 2 * W.zeta * w0, n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
    for (let s = 0; s < n; s++) {
      qv[0] += (-kk * (q[0] - tx) - cc * qv[0]) * h; q[0] += qv[0] * h;
      qv[1] += (-kk * (q[1] - ty) - cc * qv[1]) * h; q[1] += qv[1] * h;
      qv[2] += (-kk * (q[2] - tz) - cc * qv[2]) * h; q[2] += qv[2] * h;
      av[0] += (-kk * (a[0] - ux) - cc * av[0]) * h; a[0] += av[0] * h;
      av[1] += (-kk * (a[1] - uy) - cc * av[1]) * h; a[1] += av[1] * h;
      av[2] += (-kk * (a[2] - uz) - cc * av[2]) * h; a[2] += av[2] * h;
    }
  }
  // never past the most it may lag (the rate outward is dropped with it)
  const ql = Math.hypot(q[0], q[1], q[2]), al = Math.hypot(a[0], a[1], a[2]);
  if (ql > W.maxMm) { const f = W.maxMm / ql; for (let i = 0; i < 3; i++) { q[i] *= f; qv[i] *= 0.5; } }
  if (al > W.maxRad) { const f = W.maxRad / al; for (let i = 0; i < 3; i++) { a[i] *= f; av[i] *= 0.5; } }
  const still = tx === 0 && ty === 0 && tz === 0 && ux === 0 && uy === 0 && uz === 0 &&
    ql < W.restMm && Math.hypot(qv[0], qv[1], qv[2]) < W.restMm * w0 && al < W.restRad && Math.hypot(av[0], av[1], av[2]) < W.restRad * w0;
  if (still) { q.fill(0); qv.fill(0); a.fill(0); av.fill(0); }
  L.wobbling = !still;
  return L;
}

/** Write the state into the shared uniform values (plain arrays or typed arrays, x y z w):
 *  live: (swell share, beat 0..1, breath -1..1, 1 when any bloom is drawn); q: (lag xyz mm, 1 while it wobbles);
 *  a: (turn lag xyz, -); b: per slot (centre xyz, swell mm: above 0 a swell, below 0 a dimple); bc: per slot (colour
 *  x strength rgb, 1 / radius^2); ring / ringc (when given): the ring of the last movement switched on (centre xyz,
 *  its radius in mm now, 0 = none) and (colour x strength rgb, 1 / width^2).
 * `centre` (nsLiveC: centre xyz, 1 / wobble radius) is written by the scene when the brain is framed. */
export function writeLiveUniforms(L, U, o = BRAIN_LIVE) {
  const B = o.bloom;
  U.live[0] = L.swell; U.live[1] = L.beat; U.live[2] = L.breath; U.live[3] = L.blooms > 0 ? 1 : 0;
  U.q[0] = L.q[0]; U.q[1] = L.q[1]; U.q[2] = L.q[2]; U.q[3] = L.wobbling ? 1 : 0;
  U.a[0] = L.a[0]; U.a[1] = L.a[1]; U.a[2] = L.a[2];
  for (let i = 0; i < L.slots; i++) {
    const s = L.slotId[i] === null ? 0 : L.slotS[i], r = B.radiusMm * (B.radius0 + (1 - B.radius0) * L.slotG[i]);
    U.b[4 * i] = L.slotC[3 * i]; U.b[4 * i + 1] = L.slotC[3 * i + 1]; U.b[4 * i + 2] = L.slotC[3 * i + 2];
    U.b[4 * i + 3] = L.reducedMotion || L.slotId[i] === null ? 0 : L.slotL[i];
    U.bc[4 * i] = L.slotCol[3 * i] * s; U.bc[4 * i + 1] = L.slotCol[3 * i + 1] * s; U.bc[4 * i + 2] = L.slotCol[3 * i + 2] * s;
    U.bc[4 * i + 3] = 1 / (r * r);
  }
  if (U.ring && U.ringc) {
    const on = L.ringAge >= 0 && !L.reducedMotion, ph = on ? Math.min(1, L.ringAge / B.pulseS) : 0;
    const amp = on ? (1 - ph) ** 1.5 : 0, w = B.pulseW * B.radiusMm * (1 + ph);
    U.ring[0] = L.ringC[0]; U.ring[1] = L.ringC[1]; U.ring[2] = L.ringC[2]; U.ring[3] = on ? B.radiusMm * (B.pulseFrom + (B.pulseTo - B.pulseFrom) * (1 - (1 - ph) * (1 - ph))) : 0;
    U.ringc[0] = L.ringCol[0] * amp; U.ringc[1] = L.ringCol[1] * amp; U.ringc[2] = L.ringCol[2] * amp; U.ringc[3] = 1 / (w * w);
  }
  return U;
}

/** Where an area's bloom sits (and where the tissue gives under the look): ON the visible face of its key. `parts`:
 * the area's vertex positions (flat xyz arrays, source mm); O: the brain's middle. The plain middle of the vertices
 * lies under the surface (an area's banks go 15 to 25 mm down into the sulci), so the point is taken out along the
 * line from O through that middle to the outermost vertex of the area that lies within nearMm OF THAT LINE: the crown
 * right above the middle (not the area's outermost vertex anywhere, which can be at its far end: the point then hung
 * in the air beyond the key and, seen from close by, behind the horizon). With no vertex that near the line, the
 * vertex nearest the line is taken. Writes out[0..2] and returns out (the middle itself for an empty area). Pure. */
export function bloomCentreOf(out, parts, O, nearMm = 5) {
  let mx = 0, my = 0, mz = 0, n = 0;
  for (const p of parts) for (let i = 0; i + 2 < p.length; i += 3) { mx += p[i]; my += p[i + 1]; mz += p[i + 2]; n++; }
  if (!n) { out[0] = O[0]; out[1] = O[1]; out[2] = O[2]; return out; }
  mx /= n; my /= n; mz /= n;
  let ux = mx - O[0], uy = my - O[1], uz = mz - O[2];
  const l = Math.hypot(ux, uy, uz);
  if (!(l > 1e-6)) { out[0] = mx; out[1] = my; out[2] = mz; return out; }
  ux /= l; uy /= l; uz /= l;
  let far = -Infinity, best = Infinity, bx = mx, by = my, bz = mz;
  const near2 = nearMm * nearMm;
  for (const p of parts) for (let i = 0; i + 2 < p.length; i += 3) {
    const dx = p[i] - O[0], dy = p[i + 1] - O[1], dz = p[i + 2] - O[2], t = dx * ux + dy * uy + dz * uz;
    if (!(t > 0)) continue;
    const off2 = dx * dx + dy * dy + dz * dz - t * t;
    if (off2 <= near2 && t > far) far = t;
    if (off2 < best) { best = off2; bx = p[i]; by = p[i + 1]; bz = p[i + 2]; }
  }
  if (far > -Infinity) { out[0] = O[0] + ux * far; out[1] = O[1] + uy * far; out[2] = O[2] + uz * far; }
  else { out[0] = bx; out[1] = by; out[2] = bz; }
  return out;
}

/** The point the beat's swell grows about (see BRAIN_LIVE.beat): the point of the line through `eye` along `dir`
 * (both in source mm; dir any length) nearest the brain's `centre`, kept within maxMm of the centre. Writes out[0..2]
 * and returns out. A line of no length gives the centre. Pure, no allocation. */
export function beatCentre(out, centre, eye, dir, maxMm = BRAIN_LIVE.beat.aimMm) {
  const dd = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2];
  if (!(dd > 1e-18) || !Number.isFinite(dd + eye[0] + eye[1] + eye[2])) { out[0] = centre[0]; out[1] = centre[1]; out[2] = centre[2]; return out; }
  const t = ((centre[0] - eye[0]) * dir[0] + (centre[1] - eye[1]) * dir[1] + (centre[2] - eye[2]) * dir[2]) / dd;
  let x = eye[0] + t * dir[0] - centre[0], y = eye[1] + t * dir[1] - centre[1], z = eye[2] + t * dir[2] - centre[2];
  const l = Math.hypot(x, y, z);
  if (l > maxMm) { const f = maxMm / l; x *= f; y *= f; z *= f; }
  out[0] = centre[0] + x; out[1] = centre[1] + y; out[2] = centre[2] + z;
  return out;
}

/** How far a rest position p (source mm, [x, y, z]) is moved, with the same rule as the shaders' nsLiveMove (for
 * tests and checks; `centre` = the brain's centre, source mm; `swellCentre` = the point the beat grows about, the
 * centre when not given). Returns [dx, dy, dz] in source mm. Pure. */
export function liveMove(L, p, centre, o = BRAIN_LIVE, swellCentre = centre) {
  const dx = p[0] - centre[0], dy = p[1] - centre[1], dz = p[2] - centre[2], d2 = dx * dx + dy * dy + dz * dz;
  const m = [(p[0] - swellCentre[0]) * L.swell, (p[1] - swellCentre[1]) * L.swell, (p[2] - swellCentre[2]) * L.swell];
  if (L.wobbling) {
    const w = Math.min(1, d2 / (o.wobble.radiusMm * o.wobble.radiusMm)), a = L.a, q = L.q;
    m[0] += w * (q[0] + a[1] * dz - a[2] * dy); m[1] += w * (q[1] + a[2] * dx - a[0] * dz); m[2] += w * (q[2] + a[0] * dy - a[1] * dx);
  }
  if (L.blooms > 0 && !L.reducedMotion) {
    const len = Math.max(Math.sqrt(d2), 1e-3), B = o.bloom;
    for (let i = 0; i < L.slots; i++) {
      if (L.slotId[i] === null || L.slotL[i] === 0) continue;
      const ex = p[0] - L.slotC[3 * i], ey = p[1] - L.slotC[3 * i + 1], ez = p[2] - L.slotC[3 * i + 2];
      const r = B.radiusMm * (B.radius0 + (1 - B.radius0) * L.slotG[i]);
      const g = L.slotL[i] * Math.exp(-(ex * ex + ey * ey + ez * ez) / (r * r));
      m[0] += g * dx / len; m[1] += g * dy / len; m[2] += g * dz / len;
    }
  }
  return m;
}

/* ------------------------------------------------------------------ shaders */

const glslFloat = x => (Number.isInteger(x) ? `${x}.0` : `${x}`);

/** The uniforms every brain shader shares, and the displacement (vertex shaders). nsLiveMove( p ): how far the rest
 * position p (source mm) moves: the swell about nsLiveO (beatCentre), the wobble (more toward the outside of the
 * brain, whose centre is nsLiveC) and the blooms' local swell (away from the centre). nsLiveTilt( p ): how the blooms' swell leans the surface there (to add to an
 * object-space normal before it is turned into view space). */
export function liveVertexHead(slots = BRAIN_LIVE.bloom.slots, o = BRAIN_LIVE) {
  // `invariant`: the surface is drawn twice (a depth pre-pass, then its colour where the depth is equal) by two
  // different programs; without it their compilers may round this arithmetic differently and the colour pass loses
  // pixels (seen as ragged dark holes while the tissue wobbled).
  return `invariant gl_Position;
uniform vec4 nsLive;
uniform vec4 nsLiveC;
uniform vec4 nsLiveO;
uniform vec4 nsLiveQ;
uniform vec4 nsLiveA;
uniform vec4 nsLiveB[ ${slots} ];
uniform vec4 nsLiveBc[ ${slots} ];
vec3 nsLiveMove( vec3 p ) {
	vec3 d = p - nsLiveC.xyz;
	vec3 m = ( p - nsLiveO.xyz ) * nsLive.x;
	if ( nsLiveQ.w > 0.0 ) m += min( dot( d, d ) * nsLiveC.w * nsLiveC.w, 1.0 ) * ( nsLiveQ.xyz + cross( nsLiveA.xyz, d ) );
	if ( nsLive.w > 0.0 ) {
		vec3 u = d / max( length( d ), 1e-3 );
		for ( int i = 0; i < ${slots}; i ++ ) {
			if ( nsLiveB[ i ].w != 0.0 ) { vec3 e = p - nsLiveB[ i ].xyz; m += u * ( nsLiveB[ i ].w * exp( - dot( e, e ) * nsLiveBc[ i ].w ) ); }
		}
	}
	return m;
}
vec3 nsLiveTilt( vec3 p ) {
	vec3 t = vec3( 0.0 );
	if ( nsLive.w > 0.0 ) {
		for ( int i = 0; i < ${slots}; i ++ ) {
			if ( nsLiveB[ i ].w != 0.0 ) { vec3 e = p - nsLiveB[ i ].xyz; t += e * ( ${glslFloat(2 * o.bloom.tilt)} * nsLiveB[ i ].w * nsLiveBc[ i ].w * exp( - dot( e, e ) * nsLiveBc[ i ].w ) ); }
		}
	}
	return t;
}
`;
}

const LIVE_VERTEX_HOOK = '#include <begin_vertex>';
/** Patch a Three vertex shader so its vertices move with the living brain (pure): after begin_vertex, `transformed`
 * moves by nsLiveMove of the REST position (the `position` attribute, source mm). Returns the shader, or null when
 * the hook is missing or the shader is already patched.
 * rigidAt: for a small rigid thing that SITS on the brain and whose vertices are in its own frame (a marker): the whole
 * thing moves by nsLiveMove of one point of the brain instead, given by the uniform nsLiveAt (xyz: that point, source
 * mm; w: 1 / the thing's own scale, so the move is in its own units). */
export function patchLiveVertex(vertexShader, slots = BRAIN_LIVE.bloom.slots, { rigidAt = false } = {}) {
  if (typeof vertexShader !== 'string' || !vertexShader.includes(LIVE_VERTEX_HOOK) || vertexShader.includes('nsLiveMove')) return null;
  const move = rigidAt ? 'nsLiveMove( nsLiveAt.xyz ) * nsLiveAt.w' : 'nsLiveMove( position )';
  return (rigidAt ? 'uniform vec4 nsLiveAt;\n' : '') + liveVertexHead(slots) + vertexShader.replace(LIVE_VERTEX_HOOK, `${LIVE_VERTEX_HOOK}\n\ttransformed += ${move};`);
}

/** The uniforms of the living tissue's colour (fragment shaders of the brain surface). */
export function liveFragmentHead(slots = BRAIN_LIVE.bloom.slots) {
  return `uniform vec4 nsLive;\nuniform vec4 nsLiveB[ ${slots} ];\nuniform vec4 nsLiveBc[ ${slots} ];\nuniform vec4 nsLiveR;\nuniform vec4 nsLiveRc;\n`;
}

/** GLSL (fragment, brain surface): the blooms at an atlas position. Declares nsLvF (0..1: how strongly a bloom
 * reaches this fragment), nsLvC (the keys' light landing here, linear rgb: the bloom and, while it spreads, the ring
 * at its edge), nsLvK (that light's core next to the key, for the part above white) and nsLvP (the ring of a
 * movement being switched on, here: its colour x its strength). `pos` is the name of the atlas position (source mm)
 * in scope. */
export function liveBloomGlsl(pos, slots = BRAIN_LIVE.bloom.slots, o = BRAIN_LIVE) {
  const B = o.bloom, f = glslFloat;
  return `float nsLvF = 0.0; vec3 nsLvC = vec3( 0.0 ); vec3 nsLvK = vec3( 0.0 ); vec3 nsLvP = vec3( 0.0 );
	if ( nsLiveR.w > 0.0 ) {
		float nsLvQ = length( ${pos} - nsLiveR.xyz ) - nsLiveR.w;
		nsLvP = nsLiveRc.rgb * exp( - nsLvQ * nsLvQ * nsLiveRc.w );
	}
	if ( nsLive.w > 0.0 ) {
		for ( int i = 0; i < ${slots}; i ++ ) {
			float nsLvS = max( nsLiveBc[ i ].r, max( nsLiveBc[ i ].g, nsLiveBc[ i ].b ) );
			if ( nsLvS > 0.0 ) {
				vec3 nsLvE = ${pos} - nsLiveB[ i ].xyz;
				float nsLvD2 = dot( nsLvE, nsLvE ), nsLvG = exp( - nsLvD2 * nsLiveBc[ i ].w );
				float nsLvR = inversesqrt( nsLiveBc[ i ].w );
				float nsLvU = ( sqrt( nsLvD2 ) / nsLvR - ${f(B.ringAt)} ) / ${f(B.ringW)};
				float nsLvRing = ${f(B.ring)} * exp( - nsLvU * nsLvU ) * ( 1.0 - clamp( ( nsLvR / ${f(B.radiusMm)} - ${f(B.radius0)} ) / ${f(1 - B.radius0)}, 0.0, 1.0 ) );
				nsLvF += nsLvS * nsLvG; nsLvC += nsLiveBc[ i ].rgb * ( nsLvG + nsLvRing ); nsLvK += nsLiveBc[ i ].rgb * ( nsLvG * nsLvG * nsLvG );
			}
		}
		nsLvF = min( nsLvF, 1.0 );
	}`;
}
